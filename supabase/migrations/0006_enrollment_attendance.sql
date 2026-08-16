-- Matrícula, asistencia y progreso.

create type enrollment_status as enum (
  'inscrito', 'en_progreso', 'completado', 'retirado'
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  class_offering_id uuid not null references class_offerings (id) on delete cascade,
  person_id uuid not null references people (id),
  status enrollment_status not null default 'inscrito',
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid references auth.users (id),
  completed_at timestamptz,
  notes text,
  unique (class_offering_id, person_id)
);

create index enrollments_class_idx on enrollments (class_offering_id);
create index enrollments_person_idx on enrollments (person_id);

alter table enrollments enable row level security;

-- Staff y el maestro de la clase pueden ver/gestionar matrículas de su clase.
-- Un miembro puede ver sus propias matrículas (portal del miembro).
create policy enrollments_select on enrollments
  for select
  using (
    is_staff()
    or person_id = current_person_id()
  );

create policy enrollments_write_staff_or_teacher on enrollments
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or exists (
      select 1 from class_offerings co
      where co.id = enrollments.class_offering_id
        and co.teacher_person_id = current_person_id()
        and has_role('maestro')
    )
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or exists (
      select 1 from class_offerings co
      where co.id = enrollments.class_offering_id
        and co.teacher_person_id = current_person_id()
        and has_role('maestro')
    )
  );

-- Asistencia por sesión de clase.
create type attendance_status as enum ('presente', 'ausente', 'excusado', 'tarde');

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references class_sessions (id) on delete cascade,
  person_id uuid not null references people (id),
  status attendance_status not null default 'presente',
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id),
  unique (class_session_id, person_id)
);

create index attendance_records_session_idx on attendance_records (class_session_id);
create index attendance_records_person_idx on attendance_records (person_id);

alter table attendance_records enable row level security;

create policy attendance_select on attendance_records
  for select
  using (
    is_staff()
    or person_id = current_person_id()
  );

create policy attendance_write_staff_or_teacher on attendance_records
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
    or exists (
      select 1
      from class_sessions cs
      join class_offerings co on co.id = cs.class_offering_id
      where cs.id = attendance_records.class_session_id
        and co.teacher_person_id = current_person_id()
        and has_role('maestro')
    )
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
    or exists (
      select 1
      from class_sessions cs
      join class_offerings co on co.id = cs.class_offering_id
      where cs.id = attendance_records.class_session_id
        and co.teacher_person_id = current_person_id()
        and has_role('maestro')
    )
  );

-- Vista de progreso: % de sesiones asistidas por matrícula.
create view enrollment_progress as
select
  e.id as enrollment_id,
  e.class_offering_id,
  e.person_id,
  e.status,
  count(cs.id) as total_sessions,
  count(ar.id) filter (where ar.status in ('presente', 'tarde')) as attended_sessions,
  case
    when count(cs.id) = 0 then 0
    else round(
      100.0 * count(ar.id) filter (where ar.status in ('presente', 'tarde'))
      / count(cs.id)
    )
  end as attendance_percent
from enrollments e
join class_sessions cs on cs.class_offering_id = e.class_offering_id
left join attendance_records ar
  on ar.class_session_id = cs.id and ar.person_id = e.person_id
group by e.id, e.class_offering_id, e.person_id, e.status;

comment on view enrollment_progress is
  'Progreso calculado (porcentaje de asistencia) por matrícula. Hereda '
  'RLS de las tablas base vía security_invoker.';

alter view enrollment_progress set (security_invoker = on);
