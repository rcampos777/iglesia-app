-- Apóstol = todos los permisos (decisión del dueño del producto, 2026-09-28).
--
-- El rango más alto de la iglesia son los apóstoles (pastores generales de
-- la congregación). Hasta 0035 el rol `apostol` solo abría Finanzas; ahora
-- pasa TODOS los chequeos de rol: administración, personas, cursos,
-- ministerios, asistencia, oración y finanzas.
--
-- Se hace en las dos funciones que usan todas las políticas RLS y funciones
-- de permisos (has_role / has_any_role), así que aplica a todas las capas
-- sin tocar cada política. Consecuencias:
-- - is_admin(), is_staff(), is_prayer_reader(), can_*() y
--   has_finance_access() son verdaderos para un apostol.
-- - `administrador` sigue SIN acceso financiero (no cambia).
-- - Asignar `apostol`/`finanzas` sigue siendo exclusivo de un Apóstol
--   (trigger user_roles_guard_financial de 0035), y el último Apóstol sigue
--   protegido.
-- - La protección del último administrador cuenta solo filas
--   role = 'administrador' (no cambia).

create or replace function has_role(check_role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    where ur.user_id = auth.uid()
      and (ur.role = check_role or ur.role = 'apostol')
  );
$$;

create or replace function has_any_role(check_roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    where ur.user_id = auth.uid()
      and (ur.role = any (check_roles) or ur.role = 'apostol')
  );
$$;

comment on function has_role is
  'Tiene el rol pedido, o es apostol (todos los permisos desde 0036).';
comment on function has_any_role is
  'Tiene alguno de los roles pedidos, o es apostol (todos los permisos desde 0036).';
