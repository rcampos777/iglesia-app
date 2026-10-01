-- Borrar personas creadas por error (decisión 2026-10-01, docs/decisions.md).
--
-- - Solo SuperAdmin (`apostol`).
-- - Solo si la persona NO tiene nada ligado: matrícula, asistencia,
--   ministerios, actividades, inscripciones, check-ins, seguimiento,
--   peticiones de oración, donaciones/cartas, certificaciones, encuestas,
--   ni es maestro, líder o responsable de algo.
-- - Se borra también su cuenta de acceso (auth.users → profile y roles en
--   cascada), para no dejar cuentas sueltas. No se borra una cuenta con
--   acceso SuperAdmin o Finanzas (primero se le quita), ni la propia.
-- - Bitácoras que solo la mencionan (emails enviados, filas de
--   importación, invitaciones al portal) se desligan, no bloquean.
-- - Motivo obligatorio; queda en audit_log (nombre + motivo).

create or replace function person_delete_blockers(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not is_apostol() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select jsonb_strip_nulls(jsonb_build_object(
    'matriculas', nullif((select count(*) from enrollments where person_id = p_person_id), 0),
    'asistencia_clases', nullif((select count(*) from attendance_records where person_id = p_person_id), 0),
    'maestro_de_clases', nullif((select count(*) from class_offerings where teacher_person_id = p_person_id), 0),
    'ministerios', nullif((select count(*) from ministry_memberships where person_id = p_person_id), 0),
    'lider_de_ministerios', nullif((select count(*) from ministries where leader_person_id = p_person_id), 0),
    'actividades', nullif((select count(*) from activity_participants where person_id = p_person_id), 0),
    'responsable_de_actividades', nullif((select count(*) from activities where responsible_person_id = p_person_id), 0),
    'inscripciones', nullif((select count(*) from activity_registrations where person_id = p_person_id), 0),
    'asistencia_cultos', nullif((select count(*) from service_checkins where person_id = p_person_id), 0),
    'seguimiento', nullif((select count(*) from visitor_follow_ups where person_id = p_person_id), 0),
    'peticiones_oracion', nullif((select count(*) from prayer_requests where requester_person_id = p_person_id), 0),
    'donaciones', nullif((select count(*) from donations where person_id = p_person_id), 0),
    'cartas_donativos', nullif((select count(*) from donation_letters where person_id = p_person_id), 0),
    'certificaciones', nullif((select count(*) from person_certifications where person_id = p_person_id), 0),
    'encuestas', nullif((select count(*) from survey_responses where person_id = p_person_id), 0)
  )) into v;
  return v;
end;
$$;

revoke all on function person_delete_blockers(uuid) from public, anon;
grant execute on function person_delete_blockers(uuid) to authenticated;

create or replace function delete_person(p_person_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person people%rowtype;
  v_user uuid;
  v_blockers jsonb;
begin
  if not is_apostol() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Escribe el motivo (mínimo 5 caracteres).';
  end if;

  select * into v_person from people where id = p_person_id for update;
  if not found then
    raise exception 'Persona no encontrada.';
  end if;

  select id into v_user from profiles where person_id = p_person_id;
  if v_user is not null and v_user = auth.uid() then
    raise exception 'No puedes borrar tu propia cuenta.';
  end if;
  if v_user is not null and exists (
    select 1 from user_roles where user_id = v_user and role in ('apostol', 'finanzas')
  ) then
    raise exception 'Primero quítale el acceso SuperAdmin o Finanzas (Finanzas → Acceso).';
  end if;

  v_blockers := person_delete_blockers(p_person_id);
  if v_blockers <> '{}'::jsonb then
    raise exception 'tiene_registros' using detail = v_blockers::text;
  end if;

  -- Bitácoras que solo la mencionan.
  update notification_log set recipient_person_id = null where recipient_person_id = p_person_id;
  update import_rows set matched_person_id = null where matched_person_id = p_person_id;
  update import_rows set promoted_person_id = null where promoted_person_id = p_person_id;

  -- Su propio registro suele apuntar a su cuenta (alta por registro).
  update people set created_by = null, updated_by = null where id = p_person_id;

  begin
    if v_user is not null then
      -- profile y user_roles caen en cascada con la cuenta.
      delete from auth.users where id = v_user;
    end if;
    delete from people where id = p_person_id;
  exception when foreign_key_violation then
    raise exception 'tiene_registros'
      using detail = '{"otros_registros": 1}';
  end;

  perform log_audit_event(
    'person.delete', 'person', p_person_id,
    jsonb_build_object(
      'name', v_person.first_name || ' ' || v_person.last_name,
      'had_account', v_user is not null,
      'reason', btrim(p_reason)
    )
  );
end;
$$;

revoke all on function delete_person(uuid, text) from public, anon;
grant execute on function delete_person(uuid, text) to authenticated;

notify pgrst, 'reload schema';
