-- Inicio de sesión con Google y Apple (decisión 2026-10-10,
-- docs/decisions.md).
--
-- Una cuenta creada con Google o Apple llega sin nombre y apellido
-- confiables (Apple casi nunca los manda; Google manda un nombre completo
-- sin separar). La persona debe completarlos en /completar-perfil antes de
-- usar la app.
--
-- 1. profiles.profile_completed_at: cuándo quedó confirmado el nombre de
--    la cuenta. NULL = hay que pedirlo. El nombre en sí sigue viviendo en
--    `people` (fuente única de verdad, enlazada por profiles.person_id).
-- 2. handle_new_auth_user(): marca el perfil como completo SOLO si la
--    persona escribió su nombre (registro con email) o si la cuenta se
--    vincula a una persona ya existente (invitación al portal). Las cuentas
--    de Google/Apple quedan pendientes. No busca ni une personas por nombre.
-- 3. complete_my_profile(): único camino para completar el propio perfil.
--    Solo la propia cuenta, una sola vez: no sobrescribe un perfil ya
--    completo (tampoco con datos del proveedor en accesos futuros).
-- 4. Trigger que impide marcar profile_completed_at con un PATCH directo
--    a la API (profiles_update_own deja editar la propia fila).

alter table profiles add column profile_completed_at timestamptz;

comment on column profiles.profile_completed_at is
  'Cuándo la persona confirmó su nombre y apellido. NULL = la app la manda '
  'a /completar-perfil antes de dejarla entrar (cuentas de Google/Apple).';

-- Cuentas existentes: completas si ya tienen nombre y apellido reales.
update profiles p
   set profile_completed_at = p.created_at
  from people pe
 where pe.id = p.person_id
   and p.profile_completed_at is null
   and btrim(pe.first_name) <> ''
   and pe.first_name <> 'Sin nombre'
   and btrim(coalesce(pe.last_name, '')) <> '';

-- ---------------------------------------------------------------------
-- 1. Alta de cuenta
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
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  v_first text := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  v_last text := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
  v_completed timestamptz;
begin
  -- SOLO app_metadata (raw_app_meta_data). Nunca user_metadata: ese
  -- campo lo puede rellenar cualquiera que llame al endpoint público de
  -- registro con la anon key, sin pasar por esta app. app_metadata solo
  -- lo escribe la Admin API (service_role), es decir, nuestro propio
  -- flujo de invitación en src/app/(auth)/activar-portal/actions.ts.
  meta_person_id := new.raw_app_meta_data ->> 'person_id';

  if meta_person_id is not null then
    -- Invitación: la persona ya existe con su nombre.
    target_person_id := meta_person_id::uuid;
    v_completed := now();
  else
    -- Google/Apple: el nombre lo pedimos en /completar-perfil; aquí no se
    -- usa lo que mande el proveedor (ni para buscar personas existentes).
    if v_provider <> 'email' then
      v_first := null;
      v_last := null;
    end if;

    insert into people (first_name, last_name, email, membership_status, created_by, source)
    values (
      coalesce(v_first, 'Sin nombre'),
      coalesce(v_last, ''),
      new.email,
      'asistente_habitual',
      new.id,
      'registro_cuenta'
    )
    returning id into target_person_id;

    if v_first is not null and v_last is not null then
      v_completed := now();
    end if;
  end if;

  insert into profiles (id, person_id, display_name, profile_completed_at)
  values (
    new.id,
    target_person_id,
    case when v_provider = 'email' then new.raw_user_meta_data ->> 'full_name' end,
    v_completed
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function handle_new_auth_user is
  'Vincula auth.users a people al registrarse. person_id SOLO se toma de '
  'raw_app_meta_data (ver 0027). Cuentas de Google/Apple quedan con '
  'profile_completed_at NULL hasta completar el perfil (ver 0052).';

-- ---------------------------------------------------------------------
-- 2. Completar el propio perfil
-- ---------------------------------------------------------------------
create or replace function complete_my_profile(p_first_name text, p_last_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := btrim(p_first_name);
  v_last text := btrim(p_last_name);
  v_person_id uuid;
  v_completed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if v_first is null or v_first = '' or v_last is null or v_last = '' then
    raise exception 'El nombre y el apellido son obligatorios.' using errcode = '22023';
  end if;
  if char_length(v_first) > 80 or char_length(v_last) > 80 then
    raise exception 'El nombre o el apellido es demasiado largo.' using errcode = '22023';
  end if;

  select person_id, profile_completed_at
    into v_person_id, v_completed
    from profiles
   where id = auth.uid()
   for update;

  if v_person_id is null then
    raise exception 'Tu cuenta no tiene un perfil asociado.';
  end if;
  -- Ya completo: no se vuelve a escribir el nombre por esta vía.
  if v_completed is not null then
    raise exception 'Tu perfil ya está completo.' using errcode = '55000';
  end if;

  update people
     set first_name = v_first, last_name = v_last, updated_by = auth.uid()
   where id = v_person_id;

  update profiles
     set display_name = v_first || ' ' || v_last, profile_completed_at = now()
   where id = auth.uid();
end;
$$;

revoke all on function complete_my_profile(text, text) from public, anon;
grant execute on function complete_my_profile(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. profile_completed_at no se toca con un PATCH directo
-- ---------------------------------------------------------------------
-- SECURITY INVOKER a propósito: current_user es quien hace el UPDATE.
-- Un usuario por la API llega como `authenticated`; complete_my_profile()
-- (SECURITY DEFINER) llega como el dueño de la función.
create or replace function prevent_profile_completion_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.profile_completed_at is distinct from old.profile_completed_at
     and current_user in ('authenticated', 'anon') then
    raise exception 'El perfil solo se completa desde la app.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_completion_change
  before update on profiles
  for each row
  execute function prevent_profile_completion_change();

notify pgrst, 'reload schema';
