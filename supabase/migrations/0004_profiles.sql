-- Vincula una cuenta de autenticación (auth.users) con exactamente un
-- registro de people. No toda persona tiene cuenta; toda cuenta
-- corresponde a exactamente una persona.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  person_id uuid not null unique references people (id) on delete restrict,
  display_name text,
  created_at timestamptz not null default now()
);

comment on table profiles is
  '1:1 entre auth.users y people. person_id es único: una persona no '
  'puede tener más de una cuenta.';

alter table profiles enable row level security;

create policy profiles_select_own_or_staff on profiles
  for select
  using (id = auth.uid() or is_staff());

create policy profiles_update_own on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_all_admin on profiles
  for all
  using (is_admin())
  with check (is_admin());

-- current_person_id(): id de people asociado al usuario autenticado
-- actual, o null si no tiene cuenta/perfil (no debería pasar para un
-- usuario autenticado, pero se maneja de forma defensiva).
create or replace function current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select person_id from profiles where id = auth.uid();
$$;

-- Completa la política de lectura de `people` (ver 0003_people.sql):
-- un usuario sin rol de staff solo puede leer su propio registro.
create policy people_select_self on people
  for select
  using (id = current_person_id());

-- Al crearse un usuario en auth.users, se crea automáticamente su
-- registro en people (si no fue creado manualmente antes, p. ej. al
-- invitar a un miembro ya existente) y su profile.
--
-- Nota: cuando el flujo de invitación crea primero el `people` y luego
-- invita a esa persona a tener cuenta, este trigger debe enlazar el
-- profile al people existente en lugar de crear uno nuevo. Eso se
-- resuelve pasando el person_id en `raw_user_meta_data.person_id` al
-- invitar; si no viene, se crea un people nuevo a partir del email.
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
  meta_person_id := new.raw_user_meta_data ->> 'person_id';

  if meta_person_id is not null then
    target_person_id := meta_person_id::uuid;
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_auth_user();

-- Rol por defecto para cuentas nuevas: 'miembro'. Roles adicionales los
-- otorga un administrador.
create or replace function grant_default_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_roles (user_id, role)
  values (new.id, 'miembro')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_default_role
  after insert on auth.users
  for each row
  execute function grant_default_role();
