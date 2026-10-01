-- Auditoría de privacidad 2026-10-01 (docs/audit/2026-10-privacidad-seguridad.md).
--
-- H-05: el registro de emails enviados (destinatario, email, asunto) y las
-- respuestas de encuestas eran legibles por cualquier rol "staff"
-- (is_staff(): también maestro y pastor), sin relación con la persona.
-- Desde 0045 pastor y maestro solo ven a las personas a su cargo; estas
-- tablas quedaban como excepción.
--
-- - notification_log: lo leen el directorio completo, el destinatario y
--   quien envió el email. Insertar sigue abierto a staff (enviar emails),
--   pero actualizar solo quien lo creó o el directorio, y borrar solo el
--   administrador (es una bitácora).
-- - survey_responses / survey_answers: las leen el directorio completo, la
--   propia persona y quien creó la encuesta.

drop policy notification_log_select_staff on notification_log;
create policy notification_log_select_staff on notification_log
  for select
  using (
    has_directory_access()
    or recipient_person_id = current_person_id()
    or (created_by is not null and created_by = auth.uid())
  );

drop policy notification_log_write_staff on notification_log;
create policy notification_log_insert_staff on notification_log
  for insert
  with check (is_staff());
create policy notification_log_update_sender on notification_log
  for update
  using (has_directory_access() or (created_by is not null and created_by = auth.uid()))
  with check (has_directory_access() or (created_by is not null and created_by = auth.uid()));
create policy notification_log_delete_admin on notification_log
  for delete
  using (is_admin());

create or replace function is_survey_owner(p_survey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from surveys s
     where s.id = p_survey_id and s.created_by is not null and s.created_by = auth.uid()
  );
$$;

drop policy survey_responses_select on survey_responses;
create policy survey_responses_select on survey_responses
  for select
  using (
    has_directory_access()
    or person_id = current_person_id()
    or is_survey_owner(survey_id)
  );

drop policy survey_answers_select on survey_answers;
create policy survey_answers_select on survey_answers
  for select
  using (
    exists (
      select 1 from survey_responses sr
       where sr.id = survey_answers.response_id
         and (
           has_directory_access()
           or sr.person_id = current_person_id()
           or is_survey_owner(sr.survey_id)
         )
    )
  );

notify pgrst, 'reload schema';
