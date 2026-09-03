-- Ministerios: las áreas de servicio de la iglesia (alabanza, ujieres,
-- niños, intercesión, medios...) y quiénes sirven en cada una.
--
-- El rol `coordinador_ministerio` ya existía en el RBAC desde
-- 0002_roles.sql, pero no tenía ningún ámbito concreto que coordinar:
-- esta migración se lo da. Además introduce autorización *por
-- ministerio* (no solo por rol global): el líder de un ministerio puede
-- gestionar la membresía de SU ministerio sin necesitar un rol de staff
-- amplio (principio de menor privilegio, CLAUDE.md §4).

create table ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  leader_person_id uuid references people (id),
  meeting_schedule_text text,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

comment on table ministries is
  'Áreas de servicio de la iglesia. El líder se referencia por '
  'people.id (uuid), nunca por nombre.';

-- El nombre no es el identificador (el id uuid lo es), pero sí debe ser
-- único para que el staff no cree dos veces el mismo ministerio por
-- error de tipeo/mayúsculas.
create unique index ministries_name_unique_idx on ministries (lower(name));
create index ministries_leader_idx on ministries (leader_person_id);
create index ministries_active_idx on ministries (is_active);

create trigger ministries_set_updated_at
  before update on ministries
  for each row
  execute function moddatetime_updated_at();

-- Membresía: quién sirve en qué ministerio y con qué responsabilidad.
-- Una persona puede servir en varios ministerios a la vez.
create type ministry_member_role as enum ('lider', 'colider', 'miembro');

create table ministry_memberships (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries (id) on delete cascade,
  person_id uuid not null references people (id),
  role_in_ministry ministry_member_role not null default 'miembro',
  joined_at date not null default current_date,
  -- left_at null = membresía activa. No se borra la fila al salir: se
  -- cierra, para conservar el histórico de servicio de la persona.
  left_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

comment on table ministry_memberships is
  'Personas que sirven en cada ministerio. Salir del ministerio marca '
  'left_at; nunca se borra la fila, para conservar el histórico.';

-- Una persona no puede estar activa dos veces en el mismo ministerio
-- (evita duplicados al re-agregar por error). Sí puede volver a entrar
-- después de haber salido: el índice parcial solo aplica a las activas.
create unique index ministry_memberships_active_unique_idx
  on ministry_memberships (ministry_id, person_id)
  where left_at is null;

create index ministry_memberships_ministry_idx on ministry_memberships (ministry_id);
create index ministry_memberships_person_idx on ministry_memberships (person_id);

create trigger ministry_memberships_set_updated_at
  before update on ministry_memberships
  for each row
  execute function moddatetime_updated_at();

-- Liderazgo de un ministerio concreto: es líder quien está designado en
-- ministries.leader_person_id o quien tiene membresía activa como
-- lider/colider. SECURITY DEFINER (como has_role) para poder usarse
-- dentro de políticas RLS sin recursión.
create or replace function is_ministry_leader(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from ministries m
    where m.id = p_ministry_id
      and m.leader_person_id is not null
      and m.leader_person_id = current_person_id()
  )
  or exists (
    select 1
    from ministry_memberships mm
    where mm.ministry_id = p_ministry_id
      and mm.person_id = current_person_id()
      and mm.role_in_ministry in ('lider', 'colider')
      and mm.left_at is null
  );
$$;

alter table ministries enable row level security;

-- El catálogo de ministerios es visible para cualquier usuario
-- autenticado (igual que cursos): la gente necesita saber en qué se
-- puede servir. La membresía sí es más restringida (ver abajo).
create policy ministries_select_authenticated on ministries
  for select
  using (auth.uid() is not null);

create policy ministries_write_staff on ministries
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
  );

alter table ministry_memberships enable row level security;

-- Lectura de membresía: staff, el líder del ministerio, o la propia
-- persona (para ver dónde sirve en su portal). Un 'miembro' sin rol de
-- staff NO ve la lista de quién más sirve.
create policy ministry_memberships_select on ministry_memberships
  for select
  using (
    is_staff()
    or person_id = current_person_id()
    or is_ministry_leader(ministry_id)
  );

-- Escritura: staff de ministerios, o el líder de ESE ministerio.
create policy ministry_memberships_write on ministry_memberships
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
    or is_ministry_leader(ministry_id)
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio']::app_role[])
    or is_ministry_leader(ministry_id)
  );
