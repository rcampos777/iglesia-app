-- Origen de cada persona: cómo llegó al directorio (alta manual,
-- importación, inscripción en línea a una actividad o registro de
-- cuenta). Es distinto del estatus (relación con la iglesia): alguien
-- que entró por el retiro sigue siendo "visitante" y puede pasar a
-- asistente/miembro sin perder de dónde vino. Ver docs/data-model.md.

create type person_source as enum (
  'manual',
  'importacion',
  'inscripcion_actividad',
  'registro_cuenta'
);

alter table people
  add column source person_source not null default 'manual',
  add column source_activity_id uuid references activities (id) on delete set null,
  add constraint people_source_activity_check
    check (source_activity_id is null or source = 'inscripcion_actividad');

create index people_source_idx on people (source, source_activity_id);

-- Relleno de lo existente con las señales que ya hay.
update people p
   set source = 'importacion'
  from import_rows r
 where r.promoted_person_id = p.id and r.decision = 'aprobar_nuevo';

update people p
   set source = 'registro_cuenta'
  from profiles pr
 where pr.person_id = p.id and p.created_by = pr.id;

update people p
   set source = 'inscripcion_actividad', source_activity_id = r.activity_id
  from (
    select distinct on (person_id) person_id, activity_id
      from activity_registrations
     where person_id is not null
     order by person_id, created_at
  ) r
 where r.person_id = p.id
   and p.notes like 'Creado desde % inscripción en línea%';

-- El origen es un hecho histórico: no se edita desde la app.
create or replace function prevent_people_source_change()
returns trigger
language plpgsql
as $$
begin
  if new.source is distinct from old.source
     or (new.source_activity_id is distinct from old.source_activity_id
         and new.source_activity_id is not null) then
    raise exception 'El origen de una persona no se puede cambiar.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger people_source_immutable
  before update of source, source_activity_id on people
  for each row
  execute function prevent_people_source_change();

-- ---------------------------------------------------------------------
-- Las funciones que crean personas ahora guardan su origen.
-- ---------------------------------------------------------------------

create or replace function submit_activity_registration(
  p_slug text,
  p_first_name text,
  p_last_name text,
  p_address text,
  p_age integer,
  p_phone text,
  p_email text,
  p_emergency_name text,
  p_emergency_phone text,
  p_attends_church boolean,
  p_church_name text,
  p_has_medical_condition boolean,
  p_medical_details text,
  p_accept_terms boolean
)
returns table (registration_id uuid, person_id uuid, match_status registration_match_status)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_activity activities%rowtype;
  v_first text := btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g'));
  v_last text := btrim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_candidates uuid[];
  v_person uuid;
  v_status registration_match_status;
  v_reg uuid;
begin
  if not coalesce(p_accept_terms, false) then
    raise exception 'terms';
  end if;
  if coalesce(p_age, 0) < 18 then
    raise exception 'minor';
  end if;

  -- Bloquea la actividad: dos envíos simultáneos no pueden pasarse del cupo.
  select * into v_activity
    from activities
   where registration_slug = p_slug and registration_open
   for update;

  if not found
     or v_activity.status not in ('planificada', 'abierta')
     or church_today() > coalesce(v_activity.registration_closes_on, v_activity.activity_date)
     or church_today() > v_activity.activity_date then
    raise exception 'registration_closed';
  end if;

  if v_activity.capacity is not null
     and activity_taken_spots(v_activity.id) >= v_activity.capacity then
    raise exception 'activity_full';
  end if;

  if exists (
    select 1 from activity_registrations r
     where r.activity_id = v_activity.id and r.email = v_email and r.cancelled_at is null
  ) then
    raise exception 'already_registered';
  end if;

  -- Posibles coincidencias: mismo email, mismo teléfono (últimos 10
  -- dígitos) o mismo nombre completo.
  select coalesce(array_agg(p.id), '{}') into v_candidates
    from (
      select p.id
        from people p
       where p.email = v_email
          or (length(v_phone_digits) >= 7
              and right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = v_phone_digits)
          or (lower(p.first_name) = lower(v_first) and lower(p.last_name) = lower(v_last))
       limit 10
    ) p;

  if cardinality(v_candidates) = 0 then
    insert into people (first_name, last_name, email, phone, address_line, notes,
                        source, source_activity_id)
    values (v_first, v_last, v_email, btrim(p_phone), btrim(p_address),
            'Creado desde la inscripción en línea: ' || v_activity.name,
            'inscripcion_actividad', v_activity.id)
    returning id into v_person;

    insert into activity_participants (activity_id, person_id, notes)
    values (v_activity.id, v_person, 'Inscripción en línea')
    on conflict (activity_id, person_id) do nothing;

    v_status := 'vinculado';
  else
    v_status := 'posible_duplicado';
  end if;

  insert into activity_registrations (
    activity_id, first_name, last_name, address, age, phone, email,
    emergency_name, emergency_phone, attends_church, church_name,
    has_medical_condition, medical_details, terms_accepted_at,
    person_id, match_status, candidate_person_ids
  ) values (
    v_activity.id, v_first, v_last, btrim(p_address), p_age, btrim(p_phone), v_email,
    btrim(p_emergency_name), btrim(p_emergency_phone), p_attends_church,
    case when p_attends_church then nullif(btrim(coalesce(p_church_name, '')), '') end,
    p_has_medical_condition,
    case when p_has_medical_condition then nullif(btrim(coalesce(p_medical_details, '')), '') end,
    now(), v_person, v_status, v_candidates
  )
  returning id into v_reg;

  return query select v_reg, v_person, v_status;
end;
$$;

revoke execute on function submit_activity_registration(
  text, text, text, text, integer, text, text, text, text, boolean, text, boolean, text, boolean
) from public;
grant execute on function submit_activity_registration(
  text, text, text, text, integer, text, text, text, text, boolean, text, boolean, text, boolean
) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Un organizador resuelve un posible duplicado: vincula a una de las
-- personas sugeridas (o a cualquiera, si es staff), o crea una nueva
-- (p_person_id null). Completa datos vacíos de la persona sin pisar nada.
-- ---------------------------------------------------------------------

create or replace function link_activity_registration(p_registration_id uuid, p_person_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reg activity_registrations%rowtype;
  v_person uuid := p_person_id;
begin
  select * into v_reg from activity_registrations where id = p_registration_id for update;
  if not found then
    raise exception 'Inscripción no encontrada.';
  end if;
  if not can_manage_activity(activity_ministry_id(v_reg.activity_id)) then
    raise exception 'No tienes permiso para gestionar esta actividad.' using errcode = '42501';
  end if;
  if v_reg.cancelled_at is not null then
    raise exception 'La inscripción está cancelada.';
  end if;

  if v_person is null then
    insert into people (first_name, last_name, email, phone, address_line, notes, created_by,
                        source, source_activity_id)
    values (v_reg.first_name, v_reg.last_name, v_reg.email, v_reg.phone, v_reg.address,
            'Creado desde una inscripción en línea.', auth.uid(),
            'inscripcion_actividad', v_reg.activity_id)
    returning id into v_person;
  else
    if not (v_person = any (v_reg.candidate_person_ids) or is_staff()) then
      raise exception 'Esa persona no está entre las sugeridas.' using errcode = '42501';
    end if;
    if not exists (select 1 from people where id = v_person) then
      raise exception 'Persona no encontrada.';
    end if;
    update people
       set email = coalesce(email, v_reg.email),
           phone = coalesce(phone, v_reg.phone),
           address_line = coalesce(address_line, v_reg.address),
           updated_by = auth.uid()
     where id = v_person;
  end if;

  update activity_registrations
     set person_id = v_person, match_status = 'vinculado'
   where id = p_registration_id;

  insert into activity_participants (activity_id, person_id, notes, created_by)
  values (v_reg.activity_id, v_person, 'Inscripción en línea', auth.uid())
  on conflict (activity_id, person_id) do nothing;

  perform log_audit_event(
    'activity_registration.link', 'activity_registration', p_registration_id,
    jsonb_build_object('person_id', v_person, 'created', p_person_id is null)
  );

  return v_person;
end;
$$;

revoke execute on function link_activity_registration(uuid, uuid) from public, anon;
grant execute on function link_activity_registration(uuid, uuid) to authenticated;


create or replace function promote_import_row(
  p_row_id uuid,
  p_decision import_row_decision,
  p_target_person_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_normalized jsonb;
  v_new_person_id uuid;
begin
  select batch_id, normalized_data
  into v_batch_id, v_normalized
  from import_rows
  where id = p_row_id
  for update;

  if v_batch_id is null then
    raise exception 'import_row % no encontrada', p_row_id;
  end if;

  if p_decision = 'aprobar_nuevo' then
    insert into people (
      first_name, last_name, email, phone, birth_date, gender,
      address_line, city, membership_status, created_by, source
    )
    values (
      v_normalized ->> 'first_name',
      v_normalized ->> 'last_name',
      nullif(v_normalized ->> 'email', ''),
      nullif(v_normalized ->> 'phone', ''),
      nullif(v_normalized ->> 'birth_date', '')::date,
      nullif(v_normalized ->> 'gender', '')::gender_type,
      nullif(v_normalized ->> 'address_line', ''),
      nullif(v_normalized ->> 'city', ''),
      coalesce(nullif(v_normalized ->> 'membership_status', '')::membership_status, 'asistente_habitual'),
      auth.uid(),
      'importacion'
    )
    returning id into v_new_person_id;

    update import_rows
    set decision = p_decision,
        promoted_person_id = v_new_person_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_row_id;

  elsif p_decision = 'aprobar_fusion' then
    if p_target_person_id is null then
      raise exception 'aprobar_fusion requiere p_target_person_id';
    end if;

    update import_rows
    set decision = p_decision,
        promoted_person_id = p_target_person_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_row_id;

    v_new_person_id := p_target_person_id;

  elsif p_decision = 'rechazar' then
    update import_rows
    set decision = p_decision,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_row_id;
  else
    raise exception 'decisión no soportada: %', p_decision;
  end if;

  return v_new_person_id;
end;
$$;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_person_id uuid;
  meta_person_id text;
begin
  -- SOLO app_metadata (raw_app_meta_data). Nunca user_metadata: ese
  -- campo lo puede rellenar cualquiera que llame al endpoint público de
  -- registro con la anon key, sin pasar por esta app. app_metadata solo
  -- lo escribe la Admin API (service_role), es decir, nuestro propio
  -- flujo de invitación en src/app/(auth)/activar-portal/actions.ts.
  meta_person_id := new.raw_app_meta_data ->> 'person_id';

  if meta_person_id is not null then
    target_person_id := meta_person_id::uuid;

    -- Defensa en profundidad: si por lo que sea ya existe un profile
    -- para esa persona, no se pisa ni se crea una cuenta huérfana — se
    -- deja que falle alto y claro (unique_violation) en vez de crear un
    -- estado ambiguo. El flujo de invitación ya valida esto antes, pero
    -- una llamada directa a la Admin API fuera de la app pasaría por
    -- aquí igual.
  else
    insert into people (first_name, last_name, email, membership_status, created_by, source)
    values (
      coalesce(new.raw_user_meta_data ->> 'first_name', 'Sin nombre'),
      coalesce(new.raw_user_meta_data ->> 'last_name', ''),
      new.email,
      'asistente_habitual',
      new.id,
      'registro_cuenta'
    )
    returning id into target_person_id;
  end if;

  insert into profiles (id, person_id, display_name)
  values (new.id, target_person_id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
