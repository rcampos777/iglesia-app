-- Permite dar de baja una cuenta de usuario.
--
-- Encontrado al intentar borrar las cuentas de desarrollo antes de
-- empezar a usar la app en serio: todas fallaban con
--
--   23503: update or delete on table "users" violates foreign key
--   constraint "people_created_by_fkey" on table "people"
--
-- Motivo: 26 columnas de auditoría (`created_by`, `assigned_to`,
-- `recorded_by`...) referencian `auth.users` sin declarar qué hacer al
-- borrar, y Postgres asume NO ACTION — es decir, prohíbe borrar al
-- usuario mientras exista cualquier fila que lo mencione. En la práctica
-- eso hacía **imposible dar de baja a nadie** que hubiera creado algo:
-- un problema real en cuanto la iglesia empiece a rotar personal.
--
-- Se cambian a ON DELETE SET NULL: la fila de datos sobrevive (una
-- persona no se borra porque se vaya quien la registró) y solo se pierde
-- el puntero al autor. Se prefiere sobre CASCADE, que borraría personas,
-- matrículas y asistencias reales al eliminar una cuenta.
--
-- Las dos FK que ya declaraban CASCADE a propósito (`user_roles.user_id`
-- y `profiles.id`, donde la fila SÍ debe morir con el usuario) se
-- respetan: el filtro solo toca las que están en NO ACTION.

do $$
declare
  r record;
begin
  for r in
    select
      con.conname,
      con.conrelid::regclass::text as tabla,
      att.attname                  as columna
    from pg_constraint con
    join pg_class rel      on rel.oid = con.conrelid
    join pg_namespace ns   on ns.oid = rel.relnamespace
    join unnest(con.conkey) as k(attnum) on true
    join pg_attribute att  on att.attrelid = con.conrelid and att.attnum = k.attnum
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and con.confdeltype = 'a'          -- 'a' = NO ACTION
      and ns.nspname = 'public'
  loop
    -- SET NULL exige que la columna admita nulos. Dos columnas eran
    -- `not null` (prayer_request_access_log.accessed_by e
    -- import_batches.created_by): se relajan para conservar la fila de
    -- auditoría en vez de borrarla junto con el usuario.
    execute format('alter table %s alter column %I drop not null', r.tabla, r.columna);
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users (id) on delete set null',
      r.tabla, r.conname, r.columna
    );
    raise notice 'FK ajustada a ON DELETE SET NULL: %.%', r.tabla, r.columna;
  end loop;
end
$$;
