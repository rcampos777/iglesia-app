-- Cursos y clases. Las categorías son configurables (tabla, no enum) para
-- poder agregar nuevas sin migración: hombres, mujeres, adoración, nuevos
-- convertidos, liderazgo, y otras que se necesiten.

create table course_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table course_categories is
  'Categorías configurables de cursos (hombres, mujeres, adoración, '
  'nuevos convertidos, liderazgo, otros...).';

alter table course_categories enable row level security;

create policy course_categories_select_authenticated on course_categories
  for select
  using (auth.uid() is not null);

create policy course_categories_write_staff on course_categories
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  );

-- Curso: el catálogo (ej. "Discipulado I", "Escuela de líderes").
create table courses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references course_categories (id),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index courses_category_idx on courses (category_id);

create trigger courses_set_updated_at
  before update on courses
  for each row
  execute function moddatetime_updated_at();

alter table courses enable row level security;

create policy courses_select_authenticated on courses
  for select
  using (auth.uid() is not null);

create policy courses_write_staff on courses
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  );

-- Clase / cohorte: una instancia concreta de un curso, con fechas y
-- horario. Es donde se matriculan estudiantes.
create type class_status as enum ('planificada', 'activa', 'completada', 'cancelada');

create table class_offerings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id),
  label text not null,
  teacher_person_id uuid references people (id),
  location text,
  schedule_text text,
  start_date date,
  end_date date,
  capacity integer,
  status class_status not null default 'planificada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index class_offerings_course_idx on class_offerings (course_id);
create index class_offerings_teacher_idx on class_offerings (teacher_person_id);

create trigger class_offerings_set_updated_at
  before update on class_offerings
  for each row
  execute function moddatetime_updated_at();

alter table class_offerings enable row level security;

create policy class_offerings_select_authenticated on class_offerings
  for select
  using (auth.uid() is not null);

create policy class_offerings_write_staff on class_offerings
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
    or (has_role('maestro') and teacher_person_id = current_person_id())
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
    or (has_role('maestro') and teacher_person_id = current_person_id())
  );

-- Sesiones (fechas de encuentro) de una clase, usadas para tomar
-- asistencia sesión por sesión.
create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_offering_id uuid not null references class_offerings (id) on delete cascade,
  session_date date not null,
  topic text,
  created_at timestamptz not null default now(),
  unique (class_offering_id, session_date)
);

create index class_sessions_offering_idx on class_sessions (class_offering_id);

alter table class_sessions enable row level security;

create policy class_sessions_select_authenticated on class_sessions
  for select
  using (auth.uid() is not null);

create policy class_sessions_write_staff_or_teacher on class_sessions
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
    or exists (
      select 1 from class_offerings co
      where co.id = class_sessions.class_offering_id
        and co.teacher_person_id = current_person_id()
        and has_role('maestro')
    )
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
    or exists (
      select 1 from class_offerings co
      where co.id = class_sessions.class_offering_id
        and co.teacher_person_id = current_person_id()
        and has_role('maestro')
    )
  );
