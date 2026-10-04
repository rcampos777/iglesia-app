-- Aviso de privacidad y borrado del propio perfil (decisión 2026-10-03,
-- docs/decisions.md; auditoría H-02 y H-10).
--
-- 1. profiles.privacy_version / privacy_accepted_at: qué versión del aviso
--    aceptó cada cuenta y cuándo. La app pide aceptarlo al entrar si falta
--    o si la versión cambió.
-- 2. delete_my_account(): la persona borra su propio perfil desde Mi portal.
--    - Sin historial: se borra la persona y la cuenta (como 0046).
--    - Con historial (clases, asistencia, ministerios...): se ANONIMIZA la
--      persona (nombre "Persona eliminada", sin contacto ni notas), se
--      borran sus peticiones de oración, respuestas de encuestas y
--      seguimientos, y se borra la cuenta. Las estadísticas quedan sin nombre.
--    - Con donaciones, cartas o certificaciones: se borra la cuenta, pero el
--      registro queda intacto y marcado (deletion_requested_at) para que un
--      SuperAdmin lo revise (obligaciones contables y de Ley 300).
--    - No aplica a cuentas con SuperAdmin o Finanzas (primero se quita).
-- 3. anonymize_person(): el SuperAdmin anonimiza a una persona con historial
--    (por ejemplo, la que quedó pendiente de revisión).
--
-- "Borrar la cuenta": se borra de auth.users (0026 deja en NULL casi
-- todas las referencias). Si alguna bitácora obligatoria la referencia
-- (p. ej. prayer_request_access_log de un intercesor), se vacía: email ficticio, sin contraseña, sin
-- teléfono ni metadatos, bloqueada y sin sesiones. Queda solo el id para
-- que las bitácoras de auditoría sigan siendo coherentes.

alter table profiles
  add column privacy_version text check (privacy_version is null or char_length(privacy_version) <= 20),
  add column privacy_accepted_at timestamptz;

alter table people
  add column anonymized_at timestamptz,
  add column deletion_requested_at timestamptz;

comment on column people.anonymized_at is
  'Fecha en que se quitaron los datos personales (borrado con historial).';
comment on column people.deletion_requested_at is
  'La persona borró su cuenta pero tiene donaciones o certificaciones: '
  'pendiente de revisión por un SuperAdmin.';

-- ---------------------------------------------------------------------
-- Aceptar el aviso de privacidad (la propia cuenta)
-- ---------------------------------------------------------------------
create or replace function accept_privacy_notice(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Versión inválida.';
  end if;
  update profiles
     set privacy_version = p_version, privacy_accepted_at = now()
   where id = auth.uid();
end;
$$;

revoke all on function accept_privacy_notice(text) from public, anon;
grant execute on function accept_privacy_notice(text) to authenticated;

-- ---------------------------------------------------------------------
-- Conteo de lo ligado a una persona, sin chequeo de rol (uso interno).
-- person_delete_blockers (0046) sigue siendo la versión pública para el
-- SuperAdmin.
-- ---------------------------------------------------------------------
create or replace function _person_links(p_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
  ));
$$;

revoke all on function _person_links(uuid) from public, anon, authenticated;

create or replace function person_delete_blockers(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_apostol() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return _person_links(p_person_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Quitar los datos personales de una persona (uso interno)
-- ---------------------------------------------------------------------
create or replace function _anonymize_person(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update people set
    first_name = 'Persona',
    last_name = 'eliminada',
    preferred_name = null,
    birth_date = null,
    gender = null,
    email = null,
    phone = null,
    address_line = null,
    city = null,
    marital_status = null,
    notes = null,
    photo_url = null,
    membership_status = 'inactivo',
    created_by = null,
    updated_by = null,
    anonymized_at = now(),
    deletion_requested_at = null
  where id = p_person_id;

  -- Contenido personal que no aporta a las estadísticas.
  delete from prayer_requests where requester_person_id = p_person_id;
  delete from survey_responses where person_id = p_person_id;
  delete from visitor_follow_ups where person_id = p_person_id;
  delete from portal_invitations where person_id = p_person_id;

  -- Inscripciones a actividades: se conserva que se inscribió y lo pagado,
  -- no sus datos (los campos son obligatorios: se reemplazan).
  update activity_registrations set
    first_name = 'Persona',
    last_name = 'eliminada',
    address = '-',
    phone = '0000000',
    email = 'eliminada@invalid.invalid',
    emergency_name = '-',
    emergency_phone = '0000000',
    church_name = null,
    medical_details = null,
    notes = null
  where person_id = p_person_id;

  -- Bitácoras que la mencionan.
  update notification_log set recipient_person_id = null, recipient_email = null
   where recipient_person_id = p_person_id;
  update import_rows set raw_data = '{}'::jsonb, normalized_data = null,
         matched_person_id = null, promoted_person_id = null
   where matched_person_id = p_person_id or promoted_person_id = p_person_id;
end;
$$;

revoke all on function _anonymize_person(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Borrar (o, si hay referencias, vaciar y bloquear) una cuenta de acceso
-- ---------------------------------------------------------------------
create or replace function _remove_auth_user(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Roles primero: así los guardas (último administrador) avisan claro.
  delete from user_roles where user_id = p_user;

  begin
    delete from auth.users where id = p_user;
    return 'borrada';
  exception when foreign_key_violation or not_null_violation then
    -- 0026 puso ON DELETE SET NULL en casi todas las referencias; las que
    -- quedan (o columnas NOT NULL como prayer_request_access_log) lo impiden.
    null;
  end;

  delete from profiles where id = p_user;
  update auth.users
     set email = 'eliminada-' || p_user::text || '@invalid.invalid',
         raw_user_meta_data = '{}'::jsonb
   where id = p_user;

  -- Columnas y tablas propias de Supabase Auth (no existen en el entorno
  -- de pruebas mínimo, por eso se comprueban).
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until'
  ) then
    execute 'update auth.users set encrypted_password = null, phone = null,
               banned_until = now() + interval ''100 years'' where id = $1'
      using p_user;
  end if;
  if to_regclass('auth.identities') is not null then
    execute 'delete from auth.identities where user_id = $1' using p_user;
  end if;
  if to_regclass('auth.mfa_factors') is not null then
    execute 'delete from auth.mfa_factors where user_id = $1' using p_user;
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_user;
  end if;
  return 'bloqueada';
end;
$$;

revoke all on function _remove_auth_user(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- La persona borra su propio perfil
-- ---------------------------------------------------------------------
create or replace function delete_my_account(p_confirm text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_person uuid;
  v_links jsonb;
  v_result text;
begin
  if v_user is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_confirm), '') <> 'BORRAR' then
    raise exception 'Escribe BORRAR para confirmar.';
  end if;
  if exists (
    select 1 from user_roles where user_id = v_user and role in ('apostol', 'finanzas')
  ) then
    raise exception 'Tu cuenta tiene acceso SuperAdmin o Finanzas. Pide a otro SuperAdmin que te lo quite antes de borrarla.'
      using errcode = '42501';
  end if;

  select person_id into v_person from profiles where id = v_user for update;
  if v_person is null then
    raise exception 'No se encontró tu perfil.';
  end if;
  perform 1 from people where id = v_person for update;

  v_links := _person_links(v_person);

  if v_links ? 'donaciones' or v_links ? 'cartas_donativos' or v_links ? 'certificaciones' then
    -- Se conserva el registro para revisión; solo se va la cuenta.
    update people set deletion_requested_at = now() where id = v_person;
    v_result := 'pendiente_revision';
  elsif v_links = '{}'::jsonb then
    update notification_log set recipient_person_id = null, recipient_email = null
     where recipient_person_id = v_person;
    update import_rows set raw_data = '{}'::jsonb, normalized_data = null,
           matched_person_id = null, promoted_person_id = null
     where matched_person_id = v_person or promoted_person_id = v_person;
    delete from portal_invitations where person_id = v_person;
    update people set created_by = null, updated_by = null where id = v_person;
    v_result := 'borrado';
  else
    perform _anonymize_person(v_person);
    v_result := 'anonimizado';
  end if;

  perform _remove_auth_user(v_user);

  if v_result = 'borrado' then
    begin
      delete from people where id = v_person;
    exception when foreign_key_violation then
      -- Algo no contado la referencia: se anonimiza en su lugar.
      perform _anonymize_person(v_person);
      v_result := 'anonimizado';
    end;
  end if;

  -- Sin actor (la cuenta ya no existe) ni nombre.
  insert into audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (null, 'person.self_delete', 'person', v_person,
          jsonb_build_object('result', v_result, 'self_service', true));

  return v_result;
end;
$$;

revoke all on function delete_my_account(text) from public, anon;
grant execute on function delete_my_account(text) to authenticated;

-- ---------------------------------------------------------------------
-- El SuperAdmin anonimiza a una persona con historial
-- ---------------------------------------------------------------------
create or replace function anonymize_person(p_person_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if not is_apostol() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Escribe el motivo (mínimo 5 caracteres).';
  end if;
  perform 1 from people where id = p_person_id and anonymized_at is null for update;
  if not found then
    raise exception 'Persona no encontrada o ya anonimizada.';
  end if;

  select id into v_user from profiles where person_id = p_person_id;
  if v_user is not null and v_user = auth.uid() then
    raise exception 'No puedes anonimizar tu propia cuenta.';
  end if;
  if v_user is not null and exists (
    select 1 from user_roles where user_id = v_user and role in ('apostol', 'finanzas')
  ) then
    raise exception 'Primero quítale el acceso SuperAdmin o Finanzas (Finanzas → Acceso).';
  end if;

  perform _anonymize_person(p_person_id);
  if v_user is not null then
    perform _remove_auth_user(v_user);
  end if;

  perform log_audit_event(
    'person.anonymize', 'person', p_person_id,
    jsonb_build_object('had_account', v_user is not null, 'reason', btrim(p_reason))
  );
end;
$$;

revoke all on function anonymize_person(uuid, text) from public, anon;
grant execute on function anonymize_person(uuid, text) to authenticated;

notify pgrst, 'reload schema';
