-- Pastor y maestro solo ven lo que les toca (decisión 2026-10-01,
-- docs/decisions.md):
--
-- - "Personas a su cargo" (is_in_my_care): los miembros de los
--   ministerios que lidera (is_ministry_leader) y todos los alumnos que
--   han pasado por las clases que imparte (también clases terminadas).
-- - De esas personas ven el historial completo (cursos con cualquier
--   maestro, ministerios, actividades, asistencia a cultos), pero no notas
--   de seguimiento, peticiones de oración ni donaciones (esas tablas no
--   cambian y no los incluyen).
-- - El directorio completo queda para has_directory_access():
--   administrador, seguimiento, intercesor, coordinador_ministerio (y
--   SuperAdmin, implícito en has_any_role). `pastor` y `maestro` salen.
-- - El pastor sigue pudiendo crear personas; ve y edita las que creó y
--   las de su gente. Ya no gestiona Visitantes ni Importación.
-- - Los roles se suman: un pastor que además es coordinador o de
--   seguimiento conserva el directorio completo.
--
-- Encuestas y notificaciones siguen usando is_staff() (sin cambio aquí).

-- ---------------------------------------------------------------------
-- 1. Funciones
-- ---------------------------------------------------------------------

create or replace function has_directory_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array[
    'administrador', 'seguimiento', 'intercesor', 'coordinador_ministerio'
  ]::app_role[]);
$$;

comment on function has_directory_access is
  'Directorio completo de personas: administrador, seguimiento, intercesor, '
  'coordinador_ministerio (+ apostol). pastor y maestro NO (0045).';

create or replace function is_in_my_care(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_person_id() is not null and (
    exists (
      select 1
        from ministry_memberships mm
       where mm.person_id = p_person_id
         and is_ministry_leader(mm.ministry_id)
    )
    or exists (
      select 1
        from enrollments e
        join class_offerings co on co.id = e.class_offering_id
       where e.person_id = p_person_id
         and co.teacher_person_id = current_person_id()
    )
  );
$$;

comment on function is_in_my_care is
  'Persona a cargo del usuario: miembro de un ministerio que lidera o alumno '
  '(actual o pasado) de una clase que imparte. Ver 0045.';

-- Una clase se ve si: directorio completo, la imparto, estoy matriculado,
-- o un alumno a mi cargo pasó por ella (para su historial).
create or replace function can_see_class(p_class_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_directory_access()
    or exists (
      select 1 from class_offerings co
       where co.id = p_class_offering_id
         and co.teacher_person_id is not null
         and co.teacher_person_id = current_person_id()
    )
    or exists (
      select 1 from enrollments e
       where e.class_offering_id = p_class_offering_id
         and (e.person_id = current_person_id() or is_in_my_care(e.person_id))
    );
$$;

create or replace function activity_has_person_in_my_care(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from activity_participants ap
     where ap.activity_id = p_activity_id and is_in_my_care(ap.person_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. Personas
-- ---------------------------------------------------------------------

drop policy people_select_staff on people;
create policy people_select_staff on people
  for select
  using (
    has_directory_access()
    or is_in_my_care(id)
    or (created_by is not null and created_by = auth.uid())
  );

drop policy people_update_staff on people;
create policy people_update_staff on people
  for update
  using (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or (has_role('pastor') and (is_in_my_care(id) or created_by = auth.uid()))
  )
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or (has_role('pastor') and (is_in_my_care(id) or created_by = auth.uid()))
  );

drop policy profiles_select_own_or_staff on profiles;
create policy profiles_select_own_or_staff on profiles
  for select
  using (id = auth.uid() or has_directory_access() or is_in_my_care(person_id));

-- ---------------------------------------------------------------------
-- 3. Clases, matrícula y asistencia a clases
-- ---------------------------------------------------------------------

drop policy class_offerings_select_authenticated on class_offerings;
create policy class_offerings_select on class_offerings
  for select
  using (can_see_class(id));

drop policy class_sessions_select_authenticated on class_sessions;
create policy class_sessions_select on class_sessions
  for select
  using (can_see_class(class_offering_id));

drop policy enrollments_select on enrollments;
create policy enrollments_select on enrollments
  for select
  using (
    has_directory_access()
    or person_id = current_person_id()
    or is_in_my_care(person_id)
  );

drop policy attendance_select on attendance_records;
create policy attendance_select on attendance_records
  for select
  using (
    has_directory_access()
    or person_id = current_person_id()
    or is_in_my_care(person_id)
  );

-- ---------------------------------------------------------------------
-- 4. Ministerios y actividades
-- ---------------------------------------------------------------------

drop policy ministry_memberships_select on ministry_memberships;
create policy ministry_memberships_select on ministry_memberships
  for select
  using (
    has_directory_access()
    or person_id = current_person_id()
    or is_ministry_leader(ministry_id)
    or is_in_my_care(person_id)
  );

drop policy activities_select on activities;
create policy activities_select on activities
  for select
  using (
    has_directory_access()
    or (ministry_id is not null and is_ministry_leader(ministry_id))
    or is_activity_participant(id)
    or activity_has_person_in_my_care(id)
  );

drop policy activity_participants_select on activity_participants;
create policy activity_participants_select on activity_participants
  for select
  using (
    has_directory_access()
    or person_id = current_person_id()
    or is_ministry_leader(activity_ministry_id(activity_id))
    or is_in_my_care(person_id)
  );

-- ---------------------------------------------------------------------
-- 5. Asistencia a cultos (lectura)
-- ---------------------------------------------------------------------

drop policy service_checkins_select on service_checkins;
create policy service_checkins_select on service_checkins
  for select
  using (
    has_directory_access()
    or person_id = current_person_id()
    or is_in_my_care(person_id)
  );

create or replace function list_service_attendance(
  p_service_id uuid,
  p_include_voided boolean default false
)
returns table (
  checkin_id uuid,
  person_id uuid,
  display_name text,
  checked_in_at timestamptz,
  method checkin_method,
  is_correction boolean,
  correction_reason text,
  recorded_by_name text,
  voided_at timestamptz,
  void_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_detail boolean := can_correct_attendance();
begin
  if not (can_record_attendance() or v_detail or has_directory_access()) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  return query
    select
      c.id,
      c.person_id,
      p.first_name || ' ' || p.last_name,
      c.checked_in_at,
      c.method,
      c.is_correction,
      case when v_detail then c.correction_reason else null end,
      case when v_detail then (
        select rp.first_name || ' ' || rp.last_name
        from profiles pr join people rp on rp.id = pr.person_id
        where pr.id = c.checked_in_by
      ) else null end,
      c.voided_at,
      case when v_detail then c.void_reason else null end
    from service_checkins c
    join people p on p.id = c.person_id
    where c.service_id = p_service_id
      and (c.voided_at is null or (p_include_voided and v_detail))
    order by c.checked_in_at desc, c.id;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Visitantes e importación: ya no son del pastor
-- ---------------------------------------------------------------------

drop policy visitor_follow_ups_select on visitor_follow_ups;
create policy visitor_follow_ups_select on visitor_follow_ups
  for select
  using (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or assigned_to = auth.uid()
  );

drop policy visitor_follow_ups_write on visitor_follow_ups;
create policy visitor_follow_ups_write on visitor_follow_ups
  for all
  using (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or assigned_to = auth.uid()
  )
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or assigned_to = auth.uid()
  );

drop policy follow_up_notes_select on follow_up_notes;
create policy follow_up_notes_select on follow_up_notes
  for select
  using (
    exists (
      select 1 from visitor_follow_ups vf
       where vf.id = follow_up_notes.follow_up_id
         and (
           has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
           or vf.assigned_to = auth.uid()
         )
    )
  );

drop policy follow_up_notes_insert on follow_up_notes;
create policy follow_up_notes_insert on follow_up_notes
  for insert
  with check (
    exists (
      select 1 from visitor_follow_ups vf
       where vf.id = follow_up_notes.follow_up_id
         and (
           has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
           or vf.assigned_to = auth.uid()
         )
    )
  );

drop policy import_batches_all_staff on import_batches;
create policy import_batches_all_staff on import_batches
  for all
  using (has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[]))
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
  );

drop policy import_rows_all_staff on import_rows;
create policy import_rows_all_staff on import_rows
  for all
  using (has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[]))
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
  );

-- ---------------------------------------------------------------------
-- 7. Matricular: el maestro elige entre todos (solo nombres) para SU clase
-- ---------------------------------------------------------------------
-- Sin esto, un maestro con directorio acotado no podría matricular a
-- alguien que todavía no es su alumno. Igual que list_people_for_ministry_picker
-- (0019): devuelve solo id y nombre. Al matricularse, la persona pasa a
-- estar a su cargo.

create or replace function list_people_for_class_enrollment(p_class_offering_id uuid)
returns table (id uuid, first_name text, last_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or exists (
      select 1 from class_offerings co
       where co.id = p_class_offering_id
         and co.teacher_person_id = current_person_id()
         and (has_role('maestro') or has_role('pastor'))
    )
  ) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return query
    select p.id, p.first_name, p.last_name
      from people p
     order by p.last_name, p.first_name, p.id;
end;
$$;

revoke all on function list_people_for_class_enrollment(uuid) from public, anon;
grant execute on function list_people_for_class_enrollment(uuid) to authenticated;

notify pgrst, 'reload schema';
