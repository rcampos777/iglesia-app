-- FASE 1.B — Corrige el alcance del rol `pastor`.
--
-- `docs/roles-and-permissions.md` documenta desde el 2026-09-02 que
-- pastor "administra únicamente los ministerios que lidera" y en cursos
-- "solo las clases que imparte". `0023_pastor_not_admin.sql` corrigió
-- `is_admin()` correctamente (13 políticas dejaron de tratar a pastor
-- como administrador de un solo cambio), pero **nunca tocó las
-- políticas que nombran a 'pastor' directamente** dentro de
-- `has_any_role(array[...])` en lugar de pasar por `is_admin()`. Ocho
-- políticas en 3 migraciones seguían dándole a CUALQUIER pastor acceso
-- de escritura GLOBAL (no acotado) sobre catálogos de cursos y sobre
-- TODOS los ministerios, no solo los que lidera:
--
--   0005_courses.sql:   course_categories_write_staff, courses_write_staff,
--                        class_offerings_write_staff, class_sessions_write_staff_or_teacher
--   0006_enrollment_attendance.sql: enrollments_write_staff_or_teacher,
--                        attendance_write_staff_or_teacher
--   0018_ministries.sql: ministries_write_staff, ministry_memberships_write
--
-- Efecto real: un usuario con SOLO el rol `pastor` (sin `maestro` ni
-- `coordinador_ministerio`) podía editar CUALQUIER curso/categoría,
-- CUALQUIER clase (no solo las que imparte), matricular/tomar
-- asistencia en cualquier clase, y gestionar el catálogo y la membresía
-- de CUALQUIER ministerio (no solo los que lidera) — justo lo que la
-- decisión del 2026-09-02 dijo que se le quitaba. La RLS nunca se puso
-- al día con la decisión de negocio (el guard de servidor en
-- ministerios/actions.ts sí estaba correcto — ver requireMinistryEditor
-- / requireMinistryManager — pero RLS es la segunda línea real).
--
-- Corrección, siguiendo el mismo patrón ya usado para `maestro`
-- (`teacher_person_id = current_person_id()`) y para líderes de
-- ministerio (`is_ministry_leader()`):
--
-- - Cursos/categorías (sin concepto de "propio" en el esquema — no hay
--   un `teacher_person_id` a ese nivel): pastor deja de tener escritura
--   directa, igual que `maestro` ya no la tenía. Sigue viendo el
--   catálogo completo (lectura abierta a cualquier autenticado, sin
--   cambios) y editando sus propias clases donde SÍ hay ámbito claro.
-- - Clases/sesiones/matrícula/asistencia: pastor pasa a tener el MISMO
--   ámbito que maestro (`teacher_person_id = current_person_id()`), sin
--   necesitar además el rol `maestro`.
-- - Ministerios (catálogo): pastor solo edita el ministerio donde
--   `leader_person_id = current_person_id()` — no cualquiera.
-- - Membresía de ministerio: se le quita el acceso global; ya le
--   alcanza `is_ministry_leader(ministry_id)` (misma función que ya usa
--   cualquier líder sin rol de staff) para gestionar SU equipo.

-- --- course_categories -------------------------------------------------
drop policy course_categories_write_staff on course_categories;
create policy course_categories_write_staff on course_categories
  for all
  using (has_any_role(array['administrador', 'coordinador_ministerio']::app_role[]))
  with check (has_any_role(array['administrador', 'coordinador_ministerio']::app_role[]));

-- --- courses -------------------------------------------------------------
drop policy courses_write_staff on courses;
create policy courses_write_staff on courses
  for all
  using (has_any_role(array['administrador', 'coordinador_ministerio']::app_role[]))
  with check (has_any_role(array['administrador', 'coordinador_ministerio']::app_role[]));

-- --- class_offerings -------------------------------------------------
drop policy class_offerings_write_staff on class_offerings;
create policy class_offerings_write_staff on class_offerings
  for all
  using (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or ((has_role('maestro') or has_role('pastor')) and teacher_person_id = current_person_id())
  )
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or ((has_role('maestro') or has_role('pastor')) and teacher_person_id = current_person_id())
  );

-- --- class_sessions -------------------------------------------------
drop policy class_sessions_write_staff_or_teacher on class_sessions;
create policy class_sessions_write_staff_or_teacher on class_sessions
  for all
  using (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or exists (
      select 1 from class_offerings co
      where co.id = class_sessions.class_offering_id
        and co.teacher_person_id = current_person_id()
        and (has_role('maestro') or has_role('pastor'))
    )
  )
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or exists (
      select 1 from class_offerings co
      where co.id = class_sessions.class_offering_id
        and co.teacher_person_id = current_person_id()
        and (has_role('maestro') or has_role('pastor'))
    )
  );

-- --- enrollments (conserva `seguimiento`, que sí tiene acceso global) ---
drop policy enrollments_write_staff_or_teacher on enrollments;
create policy enrollments_write_staff_or_teacher on enrollments
  for all
  using (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or exists (
      select 1 from class_offerings co
      where co.id = enrollments.class_offering_id
        and co.teacher_person_id = current_person_id()
        and (has_role('maestro') or has_role('pastor'))
    )
  )
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or exists (
      select 1 from class_offerings co
      where co.id = enrollments.class_offering_id
        and co.teacher_person_id = current_person_id()
        and (has_role('maestro') or has_role('pastor'))
    )
  );

-- --- attendance_records -------------------------------------------------
drop policy attendance_write_staff_or_teacher on attendance_records;
create policy attendance_write_staff_or_teacher on attendance_records
  for all
  using (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or exists (
      select 1
      from class_sessions cs
      join class_offerings co on co.id = cs.class_offering_id
      where cs.id = attendance_records.class_session_id
        and co.teacher_person_id = current_person_id()
        and (has_role('maestro') or has_role('pastor'))
    )
  )
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or exists (
      select 1
      from class_sessions cs
      join class_offerings co on co.id = cs.class_offering_id
      where cs.id = attendance_records.class_session_id
        and co.teacher_person_id = current_person_id()
        and (has_role('maestro') or has_role('pastor'))
    )
  );

-- --- ministries (catálogo): pastor solo el/los que lidera ---------------
drop policy ministries_write_staff on ministries;
create policy ministries_write_staff on ministries
  for all
  using (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or (has_role('pastor') and leader_person_id = current_person_id())
  )
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or (has_role('pastor') and leader_person_id = current_person_id())
  );

-- --- ministry_memberships: pastor ya no tiene acceso global -------------
-- (is_ministry_leader() ya cubre al pastor que SÍ lidera el ministerio,
-- exactamente igual que a cualquier líder no-staff — ver 0018/0019).
drop policy ministry_memberships_write on ministry_memberships;
create policy ministry_memberships_write on ministry_memberships
  for all
  using (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or is_ministry_leader(ministry_id)
  )
  with check (
    has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
    or is_ministry_leader(ministry_id)
  );

comment on policy ministries_write_staff on ministries is
  'pastor acotado a los ministerios que lidera (leader_person_id): '
  'decisión 2026-09-02, aplicada en RLS el 2026-09-05 (ver '
  '0028_pastor_scope.sql — antes solo vivía en la documentación).';

comment on policy ministry_memberships_write on ministry_memberships is
  'pastor ya no tiene acceso global; is_ministry_leader() cubre a quien '
  'sí lidera. Ver 0028_pastor_scope.sql.';
