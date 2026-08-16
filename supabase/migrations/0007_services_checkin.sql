-- Servicios (cultos) y check-in por QR.

create type service_type as enum (
  'culto_general', 'oracion', 'jovenes', 'ninos', 'otro'
);

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_type service_type not null default 'culto_general',
  service_date date not null,
  start_time time,
  location text,
  is_checkin_open boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index services_date_idx on services (service_date desc);

alter table services enable row level security;

create policy services_select_authenticated on services
  for select
  using (auth.uid() is not null);

create policy services_write_staff on services
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  );

-- Check-in: cada persona puede tener a lo sumo un check-in por servicio.
-- El escaneo de QR resuelve un token de corta duración a un person_id en
-- el servidor (nunca se confía en datos firmados solo en el cliente).
create type checkin_method as enum ('qr', 'manual');

create table service_checkins (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  person_id uuid not null references people (id),
  method checkin_method not null default 'qr',
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references auth.users (id),
  unique (service_id, person_id)
);

create index service_checkins_service_idx on service_checkins (service_id);
create index service_checkins_person_idx on service_checkins (person_id);

alter table service_checkins enable row level security;

create policy service_checkins_select on service_checkins
  for select
  using (is_staff() or person_id = current_person_id());

-- El check-in en sí se realiza vía Route Handler con service role (valida
-- el token QR firmado antes de insertar), por lo que aquí solo se permite
-- inserción directa a staff para check-in manual en puerta.
create policy service_checkins_insert_staff on service_checkins
  for insert
  with check (
    has_any_role(array[
      'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
    ]::app_role[])
  );

create policy service_checkins_delete_staff on service_checkins
  for delete
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  );
