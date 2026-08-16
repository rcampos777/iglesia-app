-- Peticiones confidenciales de oración. Acceso restringido y auditado.
--
-- Diseño de seguridad (ver docs/security.md):
-- - RLS restringe el SELECT a: el autor (si está identificado), roles
--   intercesor/pastor/administrador, y quien tenga asignada la petición.
-- - El acceso de lectura queda auditado en prayer_request_access_log.
--   Postgres no dispara triggers en SELECT, así que el registro de
--   auditoría se hace desde la capa de acceso a datos del servidor
--   (src/lib/data/prayer-requests.ts), que es el único camino permitido
--   para leer detalle de una petición (no se expone select directo desde
--   el cliente para esta tabla salvo listados ya filtrados por RLS).
-- - Los emails de notificación (ver notification_log) nunca incluyen el
--   texto de content.

create type prayer_urgency as enum ('normal', 'urgente');
create type prayer_status as enum ('nueva', 'en_oracion', 'respondida', 'cerrada');

create table prayer_requests (
  id uuid primary key default gen_random_uuid(),
  requester_person_id uuid references people (id),
  submitted_by_user_id uuid references auth.users (id),
  is_anonymous boolean not null default false,
  is_confidential boolean not null default true,
  category text,
  urgency prayer_urgency not null default 'normal',
  content text not null,
  status prayer_status not null default 'nueva',
  assigned_to uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column prayer_requests.content is
  'Texto confidencial de la petición. Nunca incluir en emails ni logs. '
  'Acceso restringido por RLS y auditado en prayer_request_access_log.';

create index prayer_requests_status_idx on prayer_requests (status);
create index prayer_requests_assigned_idx on prayer_requests (assigned_to);
create index prayer_requests_requester_idx on prayer_requests (requester_person_id);

create trigger prayer_requests_set_updated_at
  before update on prayer_requests
  for each row
  execute function moddatetime_updated_at();

alter table prayer_requests enable row level security;

-- Cualquier usuario autenticado puede crear una petición (propia).
-- Si is_anonymous = true, la capa de aplicación omite requester_person_id
-- al insertar aunque el usuario esté identificado.
create policy prayer_requests_insert_own on prayer_requests
  for insert
  with check (
    submitted_by_user_id = auth.uid()
    and (
      is_anonymous
      or requester_person_id = current_person_id()
      or requester_person_id is null
    )
  );

create policy prayer_requests_select on prayer_requests
  for select
  using (
    has_any_role(array['intercesor', 'pastor', 'administrador']::app_role[])
    or assigned_to = auth.uid()
    or (not is_anonymous and submitted_by_user_id = auth.uid())
  );

create policy prayer_requests_update on prayer_requests
  for update
  using (
    has_any_role(array['intercesor', 'pastor', 'administrador']::app_role[])
    or assigned_to = auth.uid()
  )
  with check (
    has_any_role(array['intercesor', 'pastor', 'administrador']::app_role[])
    or assigned_to = auth.uid()
  );

create policy prayer_requests_delete_admin on prayer_requests
  for delete
  using (is_admin());

-- Auditoría de accesos de lectura al detalle de una petición.
create table prayer_request_access_log (
  id uuid primary key default gen_random_uuid(),
  prayer_request_id uuid not null references prayer_requests (id) on delete cascade,
  accessed_by uuid not null references auth.users (id),
  action text not null default 'view',
  accessed_at timestamptz not null default now()
);

create index prayer_request_access_log_request_idx
  on prayer_request_access_log (prayer_request_id);

alter table prayer_request_access_log enable row level security;

-- Solo pastor/administrador pueden auditar quién accedió a qué.
create policy prayer_request_access_log_select_admin on prayer_request_access_log
  for select
  using (has_any_role(array['pastor', 'administrador']::app_role[]));

-- La inserción del log la hace la función log_prayer_request_access()
-- (security definer), no el cliente directamente.
create policy prayer_request_access_log_insert_none on prayer_request_access_log
  for insert
  with check (false);

create or replace function log_prayer_request_access(request_id uuid, access_action text default 'view')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into prayer_request_access_log (prayer_request_id, accessed_by, action)
  values (request_id, auth.uid(), access_action);
end;
$$;
