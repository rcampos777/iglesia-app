-- Actividades: los eventos puntuales de la iglesia (retiros, campañas,
-- convivencias, jornadas de limpieza, celebraciones...).
--
-- Deliberadamente separadas de `services` (0007): un `service` es el
-- culto recurrente con check-in por QR, y su unidad de asistencia es el
-- check-in del día. Una actividad es un evento con FECHA PROPIA al que la
-- gente se INSCRIBE de antemano y del que se pasa lista después — dos
-- momentos distintos que aquí sí hay que distinguir (quién dijo que iba
-- vs. quién fue).
--
-- Una actividad puede pertenecer a un ministerio (0018). Eso es lo que
-- permite que el líder de ese ministerio la organice sin necesitar un rol
-- de staff, igual que gestiona a su gente.

create type activity_status as enum ('planificada', 'abierta', 'realizada', 'cancelada');

create table activities (
  id uuid primary key default gen_random_uuid(),

  -- Null = actividad general de la iglesia, no de un ministerio concreto.
  ministry_id uuid references ministries (id) on delete set null,

  name text not null,
  description text,

  activity_date date not null,
  start_time time,
  end_time time,
  location text,

  -- Null = sin límite de cupo.
  capacity integer check (capacity is null or capacity > 0),
  status activity_status not null default 'planificada',
  responsible_person_id uuid references people (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

comment on table activities is
  'Eventos puntuales de la iglesia. Distintas de `services` (cultos '
  'recurrentes con check-in). Pueden pertenecer a un ministerio.';

create index activities_date_idx on activities (activity_date desc);
create index activities_ministry_idx on activities (ministry_id);
create index activities_status_idx on activities (status);

create trigger activities_set_updated_at
  before update on activities
  for each row
  execute function moddatetime_updated_at();

-- Participantes: una fila por persona inscrita. `attended` se marca
-- después, al pasar lista. Se separan inscripción y asistencia porque la
-- diferencia entre ambas es justo el dato que la iglesia quiere seguir.
create table activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities (id) on delete cascade,
  person_id uuid not null references people (id),

  registered_at timestamptz not null default now(),
  attended boolean not null default false,
  attended_at timestamptz,

  notes text,
  created_by uuid references auth.users (id),

  -- Una persona = un registro por actividad (CLAUDE.md §3.1).
  unique (activity_id, person_id)
);

create index activity_participants_activity_idx on activity_participants (activity_id);
create index activity_participants_person_idx on activity_participants (person_id);

-- Mantiene `attended_at` coherente con `attended` sin depender de que la
-- app se acuerde de mandar ambos.
create or replace function activity_participants_sync_attended()
returns trigger
language plpgsql
as $$
begin
  if new.attended and (tg_op = 'INSERT' or not old.attended) then
    new.attended_at := now();
  elsif not new.attended then
    new.attended_at := null;
  end if;
  return new;
end;
$$;

create trigger activity_participants_sync_attended_trg
  before insert or update on activity_participants
  for each row
  execute function activity_participants_sync_attended();

-- Quién puede organizar UNA actividad concreta: los roles globales de
-- ministerios, o el líder del ministerio dueño de la actividad. El
-- `pastor` entra solo por la segunda vía (decisión 2026-09-02): organiza
-- las actividades de los ministerios que lidera, no todas.
create or replace function can_manage_activity(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
     or (p_ministry_id is not null and is_ministry_leader(p_ministry_id));
$$;

alter table activities enable row level security;

-- Lectura: staff ve todas; el líder ve las de su ministerio; y una
-- persona ve aquellas en las que está inscrita (para su portal).
create policy activities_select on activities
  for select
  using (
    is_staff()
    or (ministry_id is not null and is_ministry_leader(ministry_id))
    or exists (
      select 1
      from activity_participants ap
      where ap.activity_id = activities.id
        and ap.person_id = current_person_id()
    )
  );

create policy activities_write on activities
  for all
  using (can_manage_activity(ministry_id))
  with check (can_manage_activity(ministry_id));

alter table activity_participants enable row level security;

create policy activity_participants_select on activity_participants
  for select
  using (
    is_staff()
    or person_id = current_person_id()
    or exists (
      select 1
      from activities a
      where a.id = activity_participants.activity_id
        and a.ministry_id is not null
        and is_ministry_leader(a.ministry_id)
    )
  );

create policy activity_participants_write on activity_participants
  for all
  using (
    exists (
      select 1
      from activities a
      where a.id = activity_participants.activity_id
        and can_manage_activity(a.ministry_id)
    )
  )
  with check (
    exists (
      select 1
      from activities a
      where a.id = activity_participants.activity_id
        and can_manage_activity(a.ministry_id)
    )
  );
