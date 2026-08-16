-- Seguimiento y retención de visitantes.

create type followup_status as enum (
  'pendiente', 'en_progreso', 'completado', 'no_contactable'
);

create table visitor_follow_ups (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id),
  assigned_to uuid references auth.users (id),
  status followup_status not null default 'pendiente',
  first_visit_date date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index visitor_follow_ups_person_idx on visitor_follow_ups (person_id);
create index visitor_follow_ups_assigned_idx on visitor_follow_ups (assigned_to);
create index visitor_follow_ups_status_idx on visitor_follow_ups (status);

create trigger visitor_follow_ups_set_updated_at
  before update on visitor_follow_ups
  for each row
  execute function moddatetime_updated_at();

alter table visitor_follow_ups enable row level security;

create policy visitor_follow_ups_select on visitor_follow_ups
  for select
  using (
    has_any_role(array[
      'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
    ]::app_role[])
    or assigned_to = auth.uid()
  );

create policy visitor_follow_ups_write on visitor_follow_ups
  for all
  using (
    has_any_role(array[
      'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
    ]::app_role[])
    or assigned_to = auth.uid()
  )
  with check (
    has_any_role(array[
      'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
    ]::app_role[])
    or assigned_to = auth.uid()
  );

-- Bitácora de intentos/notas de contacto sobre un seguimiento.
create table follow_up_notes (
  id uuid primary key default gen_random_uuid(),
  follow_up_id uuid not null references visitor_follow_ups (id) on delete cascade,
  contact_method text,
  note text not null,
  contacted_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index follow_up_notes_followup_idx on follow_up_notes (follow_up_id);

alter table follow_up_notes enable row level security;

create policy follow_up_notes_select on follow_up_notes
  for select
  using (
    exists (
      select 1 from visitor_follow_ups vf
      where vf.id = follow_up_notes.follow_up_id
        and (
          has_any_role(array[
            'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
          ]::app_role[])
          or vf.assigned_to = auth.uid()
        )
    )
  );

create policy follow_up_notes_insert on follow_up_notes
  for insert
  with check (
    exists (
      select 1 from visitor_follow_ups vf
      where vf.id = follow_up_notes.follow_up_id
        and (
          has_any_role(array[
            'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
          ]::app_role[])
          or vf.assigned_to = auth.uid()
        )
    )
  );
