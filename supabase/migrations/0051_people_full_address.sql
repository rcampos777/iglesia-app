-- Dirección completa en el perfil (pedido del dueño, 2026-10-04): dos
-- líneas de dirección, ciudad, código postal y país. `address_line` sigue
-- siendo la primera línea.

alter table people
  add column address_line2 text check (address_line2 is null or char_length(address_line2) <= 200),
  add column postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  add column country text check (country is null or char_length(country) <= 100);

-- Mi portal: la persona corrige también los campos nuevos. Se reemplaza la
-- firma de 0015 (agregar parámetros crearía otra versión de la función).
drop function if exists update_own_contact_info(text, text, text, text, text);

create or replace function update_own_contact_info(
  p_phone text default null,
  p_email text default null,
  p_address_line text default null,
  p_city text default null,
  p_preferred_name text default null,
  p_address_line2 text default null,
  p_postal_code text default null,
  p_country text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  v_person_id := current_person_id();

  if v_person_id is null then
    raise exception 'No tienes un perfil de persona asociado.';
  end if;

  update people
  set
    phone = coalesce(p_phone, phone),
    email = coalesce(p_email, email),
    address_line = coalesce(p_address_line, address_line),
    address_line2 = coalesce(p_address_line2, address_line2),
    city = coalesce(p_city, city),
    postal_code = coalesce(p_postal_code, postal_code),
    country = coalesce(p_country, country),
    preferred_name = coalesce(p_preferred_name, preferred_name),
    updated_by = auth.uid()
  where id = v_person_id;
end;
$$;

revoke all on function update_own_contact_info(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function update_own_contact_info(text, text, text, text, text, text, text, text) to authenticated;

-- Borrar mi perfil (0049) también quita los campos nuevos.
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
    address_line2 = null,
    city = null,
    postal_code = null,
    country = null,
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


notify pgrst, 'reload schema';
