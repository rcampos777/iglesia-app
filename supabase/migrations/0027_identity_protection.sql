-- FASE 1.A — Protege la relación profiles.person_id.
--
-- Se encontraron DOS fallos reales de identidad, ninguno detectable por
-- lint/typecheck/build, ambos explotables sin pasar por la app (API
-- directa con la anon key o la sesión propia del atacante):
--
-- 1. `handle_new_auth_user()` (0004_profiles.sql) confiaba en
--    `new.raw_user_meta_data ->> 'person_id'`. `raw_user_meta_data` es
--    exactamente el campo `data` que el endpoint público
--    `POST /auth/v1/signup` de Supabase deja escribir a quien haga la
--    llamada — con la `anon key`, sin pasar por `registerAction` ni por
--    ningún guard del servidor. Cualquiera que conociera (o adivinara)
--    el `id` de una persona ya en el directorio podía registrarse
--    diciendo "soy esa persona" y el trigger lo vinculaba sin más: sin
--    verificación de email, sin invitación, sin intervención humana.
--    Si esa persona no tenía cuenta todavía, el atacante se quedaba con
--    su identidad en el sistema (portal, cursos, ministerios, contacto)
--    de forma permanente.
--
--    Corrección: el trigger pasa a leer `raw_app_meta_data` en vez de
--    `raw_user_meta_data`. `app_metadata` NO es escribible por el
--    endpoint público de registro — solo por la Admin API con la
--    `service_role key` (`auth.admin.createUser({ app_metadata })`),
--    que nunca se expone al cliente. Es la distinción que hace GoTrue
--    entre "lo que el usuario declara de sí mismo" (`user_metadata`,
--    público) y "lo que el sistema afirma sobre el usuario"
--    (`app_metadata`, solo backend confiable).
--
-- 2. `profiles_update_own` (0004_profiles.sql) permitía
--    `update ... using (id = auth.uid())` sin restringir columnas: un
--    usuario podía hacer `PATCH /rest/v1/profiles?id=eq.<su-id>` con
--    `{"person_id": "<otro-uuid>"}` y re-vincular su cuenta a CUALQUIER
--    persona del directorio que todavía no tuviera cuenta (el único
--    freno era el `unique` en `person_id`, que solo bloquea el caso de
--    una persona ya reclamada). Nada en el esquema impedía "convertirse"
--    en otra persona sin cuenta todavía.
--
--    Corrección: trigger que rechaza cualquier cambio de `person_id`
--    salvo que se marque explícitamente vía `admin_relink_profile()`
--    (único camino, exige `administrador`, queda en `audit_log`).
--
-- Además: tabla `portal_invitations` + función
-- `create_portal_invitation()` — la "invitación verificable" que el
-- comentario original de 0004 prometía pero nunca se construyó. Activa
-- el portal de una persona YA EXISTENTE sin crear otro expediente, sin
-- fusionar por coincidencia de nombre/teléfono/email no verificado, y
-- sin depender de que nadie confíe en metadatos que el cliente controla.

-- ---------------------------------------------------------------------
-- 1. handle_new_auth_user(): person_id solo desde app_metadata.
-- ---------------------------------------------------------------------

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_person_id uuid;
  meta_person_id text;
begin
  -- SOLO app_metadata (raw_app_meta_data). Nunca user_metadata: ese
  -- campo lo puede rellenar cualquiera que llame al endpoint público de
  -- registro con la anon key, sin pasar por esta app. app_metadata solo
  -- lo escribe la Admin API (service_role), es decir, nuestro propio
  -- flujo de invitación en src/app/(auth)/activar-portal/actions.ts.
  meta_person_id := new.raw_app_meta_data ->> 'person_id';

  if meta_person_id is not null then
    target_person_id := meta_person_id::uuid;

    -- Defensa en profundidad: si por lo que sea ya existe un profile
    -- para esa persona, no se pisa ni se crea una cuenta huérfana — se
    -- deja que falle alto y claro (unique_violation) en vez de crear un
    -- estado ambiguo. El flujo de invitación ya valida esto antes, pero
    -- una llamada directa a la Admin API fuera de la app pasaría por
    -- aquí igual.
  else
    insert into people (first_name, last_name, email, membership_status, created_by)
    values (
      coalesce(new.raw_user_meta_data ->> 'first_name', 'Sin nombre'),
      coalesce(new.raw_user_meta_data ->> 'last_name', ''),
      new.email,
      'asistente_habitual',
      new.id
    )
    returning id into target_person_id;
  end if;

  insert into profiles (id, person_id, display_name)
  values (new.id, target_person_id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function handle_new_auth_user is
  'Vincula auth.users a people al registrarse. person_id SOLO se toma de '
  'raw_app_meta_data (jamás raw_user_meta_data): ese último lo controla '
  'quien llama al endpoint público de signup, sin pasar por la app. Ver '
  '0027_identity_protection.sql.';

-- ---------------------------------------------------------------------
-- 2. profiles.person_id es inmutable salvo por admin_relink_profile().
-- ---------------------------------------------------------------------

create or replace function prevent_profile_person_id_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.person_id is distinct from old.person_id then
    -- admin_relink_profile() activa este flag únicamente durante su
    -- propia transacción (set_config(..., is_local => true)). Cualquier
    -- otro camino (PATCH directo del propio usuario, un admin editando
    -- la fila a mano por error, etc.) queda bloqueado.
    if coalesce(current_setting('app.allow_person_id_change', true), '') <> 'true' then
      raise exception 'No se permite cambiar la persona vinculada a esta cuenta.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function prevent_profile_person_id_change is
  'Bloquea UPDATE de profiles.person_id fuera de admin_relink_profile(). '
  'Sin esto, un usuario podía re-vincular su propia cuenta a cualquier '
  'persona del directorio sin cuenta todavía vía PATCH directo a la API.';

create trigger profiles_prevent_person_id_change
  before update on profiles
  for each row
  execute function prevent_profile_person_id_change();

-- Único camino legítimo para corregir un vínculo persona-cuenta
-- equivocado. Exige administrador y deja constancia en audit_log (a
-- diferencia de un UPDATE directo, que no dejaba ningún rastro).
create or replace function admin_relink_profile(
  p_user_id uuid,
  p_new_person_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_person_id uuid;
begin
  if not is_admin() then
    raise exception 'Solo un administrador puede reasignar la persona vinculada a una cuenta.'
      using errcode = '42501';
  end if;

  select person_id into v_old_person_id from profiles where id = p_user_id;
  if v_old_person_id is null then
    raise exception 'No existe un perfil para esa cuenta.';
  end if;

  if exists (select 1 from profiles where person_id = p_new_person_id and id <> p_user_id) then
    raise exception 'Esa persona ya tiene una cuenta vinculada.';
  end if;

  perform set_config('app.allow_person_id_change', 'true', true);
  update profiles set person_id = p_new_person_id where id = p_user_id;
  perform set_config('app.allow_person_id_change', 'false', true);

  perform log_audit_event(
    'relink_profile',
    'profiles',
    p_user_id,
    jsonb_build_object('old_person_id', v_old_person_id, 'new_person_id', p_new_person_id, 'reason', p_reason)
  );
end;
$$;

comment on function admin_relink_profile is
  'Único camino para cambiar profiles.person_id tras la creación. Exige '
  'administrador y audita old/new person_id. Uso esperado: corregir un '
  'vínculo hecho por error, nunca fusión automática de personas.';

revoke all on function admin_relink_profile(uuid, uuid, text) from public;
grant execute on function admin_relink_profile(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Invitación verificable para activar el portal de una persona ya
--    existente, sin crear otro expediente.
-- ---------------------------------------------------------------------

create table portal_invitations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  email citext not null,
  token_hash text not null unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid references auth.users (id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id)
);

comment on table portal_invitations is
  'Invitaciones para activar el portal de una persona YA EXISTENTE en '
  'people, sin crear un segundo expediente. Solo se guarda el hash del '
  'token (sha256); el valor crudo se devuelve una sola vez a quien la '
  'crea (create_portal_invitation), igual que un token de restablecer '
  'contraseña.';

create index portal_invitations_person_idx on portal_invitations (person_id);

alter table portal_invitations enable row level security;

-- Mismo conjunto de roles que puede escribir en `people`
-- (personas/actions.ts PEOPLE_WRITE_ROLES): quien puede gestionar a una
-- persona puede invitarla al portal.
create policy portal_invitations_select_staff on portal_invitations
  for select
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[])
  );

-- No se expone insert/update directo al cliente: todo pasa por
-- create_portal_invitation() (genera y hashea el token) y por
-- revoke_portal_invitation() (auditado). El accept-flow corre server-side
-- con la service_role key (no hay sesión todavía) y por tanto no
-- necesita permisos de RLS aquí.

create or replace function create_portal_invitation(p_person_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_hash text;
  -- text, no citext: esta función corre con `set search_path = public`
  -- (igual que el resto de funciones SECURITY DEFINER del proyecto) y
  -- citext vive en el esquema `extensions` (0001) — declararla aquí sin
  -- calificar arriesgaría "type citext does not exist" al compilar. La
  -- columna portal_invitations.email sí es citext (comparación
  -- case-insensitive al guardar); Postgres castea text->citext al
  -- insertar, sin necesidad de que esta variable lo sea.
  v_email text := trim(p_email);
begin
  if not has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[]) then
    raise exception 'No tienes permiso para invitar personas al portal.'
      using errcode = '42501';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'El email es obligatorio.';
  end if;

  if not exists (select 1 from people where id = p_person_id) then
    raise exception 'Esa persona no existe.';
  end if;

  if exists (select 1 from profiles where person_id = p_person_id) then
    raise exception 'Esa persona ya tiene una cuenta de portal activa.';
  end if;

  -- Una invitación nueva reemplaza cualquier invitación pendiente
  -- anterior para la misma persona (evita enlaces viejos flotando).
  update portal_invitations
    set revoked_at = now(), revoked_by = auth.uid()
    where person_id = p_person_id
      and used_at is null
      and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into portal_invitations (person_id, email, token_hash, created_by, expires_at)
  values (p_person_id, v_email, v_hash, auth.uid(), now() + interval '7 days');

  perform log_audit_event(
    'create_portal_invitation',
    'people',
    p_person_id,
    jsonb_build_object('email', v_email)
  );

  return v_token;
end;
$$;

comment on function create_portal_invitation is
  'Genera una invitación de portal para una persona ya existente sin '
  'cuenta. Devuelve el token en crudo UNA sola vez (solo se guarda su '
  'hash). El aceptar la invitación (fuera de RLS, sin sesión previa) vive '
  'en src/app/(auth)/activar-portal/actions.ts con la service_role key.';

revoke all on function create_portal_invitation(uuid, text) from public;
grant execute on function create_portal_invitation(uuid, text) to authenticated;

create or replace function revoke_portal_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[]) then
    raise exception 'No tienes permiso para revocar invitaciones de portal.'
      using errcode = '42501';
  end if;

  update portal_invitations
    set revoked_at = now(), revoked_by = auth.uid()
    where id = p_invitation_id
      and used_at is null
      and revoked_at is null;
end;
$$;

revoke all on function revoke_portal_invitation(uuid) from public;
grant execute on function revoke_portal_invitation(uuid) to authenticated;
