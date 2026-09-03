-- Corrige un fallo REAL de 0021, encontrado al probar la escalada de
-- privilegios con un token de sesión real de `coordinador_ministerio`:
--
-- 0021 hacía `revoke update (grants_prayer_access) on ministries from
-- authenticated`. Eso NO funciona: en Postgres, tener el privilegio
-- UPDATE a nivel de TABLA implica poder escribir todas sus columnas, y
-- revocar una columna suelta no lo quita. La prueba lo destapó: el
-- intento del coordinador no fue rechazado por permisos, sino que llegó
-- hasta el índice único (error 23505) — o sea, sí tenía permiso de
-- escribir la columna. Si el ministerio de intercesión no hubiera estado
-- ya marcado, la escalada habría funcionado.
--
-- La forma correcta y auto-mantenible (no hay que enumerar columnas) es
-- un trigger que rechace cualquier cambio del flag que no venga de un
-- administrador.

create or replace function ministries_guard_prayer_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.grants_prayer_access and not has_role('administrador') then
      raise exception 'Solo un administrador puede designar el ministerio de intercesión.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.grants_prayer_access is distinct from old.grants_prayer_access
     and not has_role('administrador') then
    raise exception 'Solo un administrador puede designar el ministerio de intercesión.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function ministries_guard_prayer_flag is
  'Impide que alguien que no sea administrador cambie grants_prayer_access, '
  'sin importar por qué vía escriba (app, API directa, etc).';

create trigger ministries_guard_prayer_flag_trg
  before insert or update on ministries
  for each row
  execute function ministries_guard_prayer_flag();

-- El revoke de 0021 era inofensivo pero engañoso (sugiere una protección
-- que no existía): se revierte para no dejar falsa sensación de
-- seguridad. La protección real es el trigger de arriba.
grant update (grants_prayer_access) on ministries to authenticated;
grant insert (grants_prayer_access) on ministries to authenticated;
