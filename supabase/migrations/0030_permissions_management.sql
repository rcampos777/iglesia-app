-- Gestión de acceso y permisos: mueve el control de roles desde la
-- "pared de botones" de /admin (otorgar/quitar rol = escritura
-- inmediata, sin resumen ni auditoría agregada) a la pestaña "Cuenta y
-- permisos" del perfil de cada persona, con cambios preparados y un
-- guardado transaccional.
--
-- Diseño (ver docs/decisions.md para el porqué de cada punto):
--
-- 1. `admin_get_account_for_person()`: la ficha necesita el email de
--    AUTENTICACIÓN (auth.users.email) y su estado verificable
--    (email_confirmed_at), nunca `people.email` (el de contacto) — son
--    cosas distintas y `people.email` puede estar lleno sin que exista
--    ninguna cuenta. Devuelve "sin cuenta" (cero filas) cuando
--    `profiles` no tiene una fila para esa persona.
--
-- 2. `admin_set_person_roles()`: guardado transaccional de un conjunto
--    completo de roles para una cuenta.
--    - Todo o nada: es una sola función plpgsql → una sola transacción;
--      cualquier `raise exception` revierte todo lo hecho hasta ahí.
--    - Detección de ediciones desactualizadas: el cliente manda el
--      conjunto de roles que tenía cargado (`p_expected_roles`) además
--      del conjunto final deseado (`p_new_roles`). Si lo que hay en la
--      base ya no coincide con lo que el cliente cargó, se rechaza con
--      un mensaje que el cliente puede distinguir (prefijo
--      `STALE_ROLES:`) en vez de sobrescribir en silencio. Si
--      `p_new_roles` es idéntico a `p_expected_roles` (no se preparó
--      ningún cambio real), no se toca la base ni se audita — cubre
--      "preparar/cancelar no modifica nada" sin necesitar una llamada al
--      servidor para esos casos.
--    - Último administrador: ver el trigger `user_roles_guard_last_admin`
--      más abajo — la protección vive ahí (no solo aquí) para que
--      también cubra un DELETE hecho por cualquier otro camino.
--    - `p_new_roles`/`p_expected_roles` son `app_role[]`: Postgres ya
--      rechaza cualquier valor que no sea uno de los 7 roles del enum
--      antes de que el cuerpo de la función se ejecute — esa es la
--      "lista permitida" contra la que se validan.
--
-- 3. Bloqueo de escritura directa a `user_roles`: hasta ahora
--    `user_roles_all_admin` dejaba a cualquier `administrador` insertar/
--    actualizar/borrar filas directo por PostgREST, sin pasar por
--    `log_audit_event`, sin chequeo de "último admin" atómico con el
--    resto de la operación, y sin detección de ediciones
--    desactualizadas. Las Server Actions viejas (`grantRoleAction`/
--    `revokeRoleAction` en admin/actions.ts) se eliminan del código,
--    pero eso no alcanza: cualquiera con la anon key y una sesión de
--    administrador podía llamar a `/rest/v1/user_roles` directo,
--    saltándose por completo la app. Se reemplaza la política por una
--    de solo lectura: a partir de aquí, la ÚNICA forma de escribir
--    `user_roles` es a través de una función `security definer` (esta
--    migración, o `grant_default_role()` de 0004), que corren como
--    dueño de la tabla y no dependen de RLS. Incluso si alguien
--    reintrodujera un botón viejo, PostgREST rechazaría el INSERT/DELETE
--    directo con "permission denied" antes de llegar a ninguna lógica.
--
-- Nota sobre honestidad de auditoría: un acceso con la `service_role key`
-- (fuera de la app) seguiría sin pasar por `log_audit_event` — mismo
-- límite ya documentado para peticiones de oración en docs/security.md
-- §4; no es nuevo de este cambio.

-- ---------------------------------------------------------------------
-- 1. Estado de cuenta de una persona (para "Cuenta y permisos" → Cuenta)
-- ---------------------------------------------------------------------
create or replace function admin_get_account_for_person(p_person_id uuid)
returns table (
  user_id uuid,
  email text,
  email_confirmed_at timestamptz,
  account_created_at timestamptz,
  roles app_role[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado.';
  end if;

  return query
    select
      p.id as user_id,
      u.email::text,
      u.email_confirmed_at,
      p.created_at as account_created_at,
      coalesce(
        (select array_agg(ur.role order by ur.role) from user_roles ur where ur.user_id = p.id),
        '{}'
      ) as roles
    from profiles p
    join auth.users u on u.id = p.id
    where p.person_id = p_person_id;
end;
$$;

comment on function admin_get_account_for_person is
  'Email/estado de AUTENTICACIÓN (auth.users), nunca people.email, para '
  'la pestaña Cuenta y permisos. Cero filas = "sin cuenta". Solo admin.';

revoke all on function admin_get_account_for_person(uuid) from public;
grant execute on function admin_get_account_for_person(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Guardado transaccional de permisos
-- ---------------------------------------------------------------------
create or replace function admin_set_person_roles(
  p_person_id uuid,
  p_expected_roles app_role[],
  p_new_roles app_role[],
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_actor uuid := auth.uid();
  v_current app_role[];
  v_expected_sorted app_role[];
  v_new_sorted app_role[];
  v_to_add app_role[];
  v_to_remove app_role[];
  v_role app_role;
  v_remaining_admins int;
begin
  if not is_admin() then
    raise exception 'No autorizado.';
  end if;

  select id into v_user_id from profiles where person_id = p_person_id;
  if v_user_id is null then
    raise exception 'Esta persona no tiene una cuenta vinculada.';
  end if;

  -- Normaliza (sin duplicados, orden estable) para poder comparar por
  -- igualdad de arreglo.
  select coalesce(array_agg(distinct r order by r), '{}') into v_expected_sorted
    from unnest(p_expected_roles) as r;
  select coalesce(array_agg(distinct r order by r), '{}') into v_new_sorted
    from unnest(p_new_roles) as r;

  -- Nada que hacer: ni se lee el estado real ni se audita. Cubre
  -- "preparar/cancelar cambios no modifica permisos" también del lado
  -- del servidor, por si algún día se llama a esta función sin cambios
  -- reales pendientes.
  if v_expected_sorted = v_new_sorted then
    return;
  end if;

  -- Serializa todo guardado sobre ESTA cuenta (evita que dos admins
  -- editando al mismo tiempo a la misma persona se pisen entre el
  -- chequeo de "desactualizado" y la escritura).
  perform pg_advisory_xact_lock(hashtext('admin_set_person_roles:' || v_user_id::text));

  select coalesce(array_agg(role order by role), '{}') into v_current
    from user_roles where user_id = v_user_id;

  if v_current is distinct from v_expected_sorted then
    raise exception 'STALE_ROLES: los permisos de esta cuenta cambiaron mientras editabas. Recarga e intenta de nuevo.';
  end if;

  select coalesce(array_agg(r), '{}') into v_to_add
    from unnest(v_new_sorted) as r where r <> all (v_current);
  select coalesce(array_agg(r), '{}') into v_to_remove
    from unnest(v_current) as r where r <> all (v_new_sorted);

  -- Chequeo temprano, NO es la garantía de concurrencia (ver más abajo):
  -- solo evita el viaje de red completo cuando es obviamente inválido
  -- (esta cuenta es la única administradora) y da un mensaje más claro
  -- que el del trigger. Dos llamadas concurrentes que remueven admin a
  -- DOS cuentas distintas podrían pasar ambas este `count` (cada una ve
  -- a la otra como "el admin que queda") antes de que ninguna confirme.
  -- La garantía real, a prueba de esa carrera, es el trigger
  -- `user_roles_guard_last_admin_trg`: usa un advisory lock de
  -- TRANSACCIÓN (se libera recién al hacer commit/rollback, no al
  -- terminar el DELETE), así que la segunda transacción que llega a
  -- borrar un administrador queda bloqueada hasta que la primera
  -- confirme, y entonces recuenta contra el estado ya committeado —
  -- ahí es donde una de las dos, correctamente, es rechazada.
  if 'administrador' = any (v_to_remove) then
    select count(*) into v_remaining_admins
      from user_roles
      where role = 'administrador' and user_id <> v_user_id;
    if v_remaining_admins = 0 then
      raise exception 'No puedes quitar el rol de administrador a la última cuenta que lo tiene.';
    end if;
  end if;

  foreach v_role in array v_to_remove loop
    delete from user_roles where user_id = v_user_id and role = v_role;
  end loop;

  foreach v_role in array v_to_add loop
    insert into user_roles (user_id, role, granted_by)
    values (v_user_id, v_role, v_actor)
    on conflict do nothing;
  end loop;

  perform log_audit_event(
    'update_roles',
    'user_roles',
    v_user_id,
    jsonb_build_object(
      'person_id', p_person_id,
      'before', to_jsonb(v_current),
      'after', to_jsonb(v_new_sorted),
      'added', to_jsonb(v_to_add),
      'removed', to_jsonb(v_to_remove),
      'reason', p_reason
    )
  );
end;
$$;

comment on function admin_set_person_roles is
  'Guardado transaccional de permisos: todo-o-nada, detecta ediciones '
  'desactualizadas (STALE_ROLES), protege al último administrador y '
  'audita antes/después. Única vía de escritura de user_roles junto '
  'con grant_default_role() (0004). Ver 0030_permissions_management.sql.';

revoke all on function admin_set_person_roles(uuid, app_role[], app_role[], text) from public;
grant execute on function admin_set_person_roles(uuid, app_role[], app_role[], text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Protección del último administrador a nivel de trigger (cubre
--    cualquier vía de escritura, no solo admin_set_person_roles)
-- ---------------------------------------------------------------------
create or replace function user_roles_guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  -- Serializa todo intento de quitar el rol administrador — sin esto,
  -- dos solicitudes concurrentes que retiran el rol a DOS cuentas
  -- distintas podrían leer, cada una, "queda al menos 1 admin más" antes
  -- de que la otra confirme, y dejar 0 administradores.
  perform pg_advisory_xact_lock(hashtext('user_roles_last_admin_guard'));

  select count(*) into v_remaining
    from user_roles
    where role = 'administrador' and user_id <> old.user_id;

  if v_remaining = 0 then
    raise exception 'No se puede quitar el rol de administrador a la última cuenta que lo tiene.'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

comment on function user_roles_guard_last_admin is
  'Bloquea borrar la última fila role=administrador de user_roles, sin '
  'importar la vía (RPC, API directa). Ver 0030_permissions_management.sql.';

create trigger user_roles_guard_last_admin_trg
  before delete on user_roles
  for each row
  when (old.role = 'administrador')
  execute function user_roles_guard_last_admin();

-- ---------------------------------------------------------------------
-- 4. user_roles deja de aceptar escritura directa por PostgREST
-- ---------------------------------------------------------------------
drop policy if exists user_roles_all_admin on user_roles;

create policy user_roles_select_admin on user_roles
  for select
  using (is_admin());

comment on policy user_roles_select_admin on user_roles is
  'Lectura para administrador (listados). La ESCRITURA ya no tiene '
  'política RLS a propósito: solo admin_set_person_roles() y '
  'grant_default_role() (security definer) pueden modificar esta tabla. '
  'Ver 0030_permissions_management.sql.';

-- (user_roles_select_own, de 0002, se conserva sin cambios.)

-- ---------------------------------------------------------------------
-- 5. list_users_with_roles: agrega búsqueda, paginación y la persona
--    vinculada (para "Ver permisos" y para detectar cuentas sin perfil).
--    Cambia la forma de retorno (agrega total_count y datos de persona),
--    así que se reemplaza en vez de "or replace" (Postgres no permite
--    cambiar las columnas de retorno de una función con la misma firma).
-- ---------------------------------------------------------------------
drop function if exists list_users_with_roles();

create or replace function list_users_with_roles(
  p_search text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  roles app_role[],
  person_id uuid,
  person_first_name text,
  person_last_name text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_term text;
begin
  if not is_admin() then
    raise exception 'No autorizado.';
  end if;

  v_term := nullif(trim(coalesce(p_search, '')), '');

  return query
    with base as (
      select
        u.id as user_id,
        u.email::text as email,
        u.created_at,
        coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}') as roles,
        pr.person_id,
        pe.first_name as person_first_name,
        pe.last_name as person_last_name
      from auth.users u
      left join user_roles ur on ur.user_id = u.id
      left join profiles pr on pr.id = u.id
      left join people pe on pe.id = pr.person_id
      where
        v_term is null
        or u.email ilike '%' || v_term || '%'
        or pe.first_name ilike '%' || v_term || '%'
        or pe.last_name ilike '%' || v_term || '%'
      group by u.id, u.email, u.created_at, pr.person_id, pe.first_name, pe.last_name
    )
    select
      base.user_id,
      base.email,
      base.created_at,
      base.roles,
      base.person_id,
      base.person_first_name,
      base.person_last_name,
      count(*) over () as total_count
    from base
    order by base.created_at desc
    limit greatest(p_limit, 1)
    offset greatest(p_offset, 0);
end;
$$;

comment on function list_users_with_roles is
  'Lista de cuentas + roles + persona vinculada (si existe) para '
  '/admin, con búsqueda y paginación (patrón de listPeople). Cuentas '
  'sin perfil vuelven con person_id null — no se vinculan solas. Solo '
  'admin. Ver 0016 (original) y 0030_permissions_management.sql.';

revoke all on function list_users_with_roles(text, int, int) from public;
grant execute on function list_users_with_roles(text, int, int) to authenticated;
