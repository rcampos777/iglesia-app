-- Lista de cuentas + roles para el panel de administración. auth.users
-- no es accesible vía PostgREST directamente (ni con RLS lo sería, al
-- no ser una tabla en `public`); esta función SECURITY DEFINER expone
-- solo id/email/fecha de creación, y verifica is_admin() internamente
-- antes de devolver nada.

create or replace function list_users_with_roles()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
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
      u.id as user_id,
      u.email::text,
      u.created_at,
      coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}') as roles
    from auth.users u
    left join user_roles ur on ur.user_id = u.id
    group by u.id, u.email, u.created_at
    order by u.created_at desc;
end;
$$;
