-- Roles mínimos del sistema (RBAC). Un usuario puede tener múltiples roles.
create type app_role as enum (
  'miembro',
  'maestro',
  'seguimiento',
  'intercesor',
  'coordinador_ministerio',
  'pastor',
  'administrador'
);

create table user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role app_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id),
  primary key (user_id, role)
);

comment on table user_roles is
  'Asignación de roles por usuario. Un usuario puede tener varios roles simultáneos.';

alter table user_roles enable row level security;

-- Funciones auxiliares SECURITY DEFINER: se usan dentro de políticas RLS
-- de todas las tablas del proyecto. Marcadas STABLE para que Postgres las
-- pueda evaluar eficientemente dentro de una misma consulta.

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
      and ur.role = check_role
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
      and ur.role = any (check_roles)
  );
$$;

-- Roles con acceso administrativo amplio (gestión de personas, cursos, etc).
create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array[
    'maestro',
    'seguimiento',
    'intercesor',
    'coordinador_ministerio',
    'pastor',
    'administrador'
  ]::app_role[]);
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['pastor', 'administrador']::app_role[]);
$$;

-- Políticas de user_roles:
-- - Un usuario puede ver sus propios roles (para construir la UI).
-- - Solo administrador/pastor pueden ver y gestionar los roles de otros.
create policy user_roles_select_own on user_roles
  for select
  using (user_id = auth.uid() or is_admin());

create policy user_roles_all_admin on user_roles
  for all
  using (is_admin())
  with check (is_admin());
