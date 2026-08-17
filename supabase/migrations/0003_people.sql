-- Directorio central de personas. Toda persona (miembro, visitante,
-- niño, etc.) tiene exactamente un registro aquí, identificado por id
-- (uuid), nunca por nombre. Una persona puede existir sin cuenta de
-- usuario (auth.users) asociada.

create type membership_status as enum (
  'visitante',
  'asistente_habitual',
  'miembro',
  'inactivo'
);

create type gender_type as enum ('masculino', 'femenino', 'no_especifica');

create table people (
  id uuid primary key default gen_random_uuid(),

  first_name text not null,
  last_name text not null,
  preferred_name text,

  birth_date date,
  gender gender_type,

  email citext,
  phone text,
  address_line text,
  city text,

  marital_status text,
  membership_status membership_status not null default 'visitante',
  joined_at date,

  notes text,
  photo_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

comment on table people is
  'Registro único por persona (miembro, visitante o de otra índole). '
  'No usar nombres como identificador: usar people.id (uuid).';

-- is_minor NO se guarda como columna: "menor de edad" es una función del
-- tiempo (current_date), no un hecho fijo de la fila, así que una columna
-- generada quedaría desactualizada entre updates (y Postgres además
-- rechaza current_date en expresiones generadas por no ser inmutable).
-- Se calcula al vuelo con esta función, informativa solamente — no se
-- recopilan datos sensibles adicionales de menores en este MVP (ver
-- docs/assumptions.md).
create or replace function is_minor(p_birth_date date)
returns boolean
language sql
stable
as $$
  select p_birth_date is not null and p_birth_date > (current_date - interval '18 years');
$$;

create index people_last_name_idx on people (last_name, first_name);
create index people_membership_status_idx on people (membership_status);
create index people_email_idx on people (email) where email is not null;

create trigger people_set_updated_at
  before update on people
  for each row
  execute function moddatetime_updated_at();

alter table people enable row level security;

-- Lectura: cualquier rol de staff puede leer todas las personas.
-- Un usuario sin rol de staff (solo 'miembro') solo puede leer su propio
-- registro — ver política `people_select_self` en 0004_profiles.sql
-- (depende de la tabla `profiles`, creada después que `people`).
create policy people_select_staff on people
  for select
  using (is_staff());

-- Escritura: roles con responsabilidad sobre el directorio.
create policy people_insert_staff on people
  for insert
  with check (
    has_any_role(array[
      'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
    ]::app_role[])
  );

create policy people_update_staff on people
  for update
  using (
    has_any_role(array[
      'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
    ]::app_role[])
  )
  with check (
    has_any_role(array[
      'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
    ]::app_role[])
  );

-- Eliminación: solo administrador (borrado real es poco frecuente; se
-- prefiere membership_status = 'inactivo').
create policy people_delete_admin on people
  for delete
  using (is_admin());
