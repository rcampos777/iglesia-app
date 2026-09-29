-- Inscripción en línea a actividades (retiros, congresos...) desde el sitio
-- público, con pagos registrados a mano (ATH Móvil / efectivo) y emails
-- automáticos. Ver docs/registrations.md.
--
-- Decisiones:
-- - Lo que llega del público se guarda en `activity_registrations` tal
--   como se envió. Si no se parece a nadie en `people`, se crea la persona
--   (visitante) y se inscribe en `activity_participants`. Si se parece a
--   alguien, queda "posible_duplicado" y un organizador decide (CLAUDE.md
--   §3.1 y §3.5: nunca se une un duplicado incierto de forma automática).
-- - Solo mayores de 18 (CLAUDE.md §3.13: sin datos detallados de menores).
-- - El público no escribe en tablas: solo llama dos funciones.

alter table activities
  add column end_date date,
  add column registration_open boolean not null default false,
  add column registration_slug text unique
    check (registration_slug is null or (
      registration_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(registration_slug) <= 80
    )),
  add column registration_closes_on date,
  add column price_cents integer check (price_cents is null or price_cents >= 0),
  add column deposit_cents integer check (deposit_cents is null or deposit_cents >= 0),
  add column payment_instructions text
    check (payment_instructions is null or char_length(payment_instructions) <= 2000),
  add column what_to_bring text check (what_to_bring is null or char_length(what_to_bring) <= 2000),
  add column contact_info text check (contact_info is null or char_length(contact_info) <= 500),
  -- Carta de bienvenida que abre el email de confirmación. {{Nombre}} se
  -- reemplaza por el nombre de la persona.
  add column confirmation_message text
    check (confirmation_message is null or char_length(confirmation_message) <= 5000),
  add column flyer_media_id uuid references site_media (id) on delete set null,
  add column notify_emails text[] not null default '{}'
    check (cardinality(notify_emails) <= 5),
  add constraint activities_end_date_check check (end_date is null or end_date >= activity_date),
  add constraint activities_deposit_check
    check (deposit_cents is null or price_cents is null or deposit_cents <= price_cents),
  add constraint activities_registration_slug_required
    check (not registration_open or registration_slug is not null);

create type registration_match_status as enum ('vinculado', 'posible_duplicado');

create table activity_registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities (id) on delete cascade,

  -- Lo que escribió la persona, tal cual (validado).
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  address text not null check (char_length(address) between 1 and 300),
  age integer not null check (age between 18 and 120),
  phone text not null check (char_length(phone) between 7 and 30),
  email citext not null check (char_length(email) between 3 and 254),
  emergency_name text not null check (char_length(emergency_name) between 1 and 150),
  emergency_phone text not null check (char_length(emergency_phone) between 7 and 30),
  attends_church boolean not null,
  church_name text check (church_name is null or char_length(church_name) <= 150),
  has_medical_condition boolean not null,
  medical_details text check (medical_details is null or char_length(medical_details) <= 500),
  terms_accepted_at timestamptz not null,

  person_id uuid references people (id) on delete set null,
  match_status registration_match_status not null,
  candidate_person_ids uuid[] not null default '{}',

  -- Mantenido por trigger desde activity_registration_payments.
  amount_paid_cents integer not null default 0,

  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id),
  notes text check (notes is null or char_length(notes) <= 1000),

  check (match_status <> 'vinculado' or person_id is not null)
);

comment on table activity_registrations is
  'Inscripciones enviadas desde el sitio público. Contiene datos de salud '
  '(condición médica): solo los organizadores de la actividad la leen.';

create index activity_registrations_activity_idx on activity_registrations (activity_id, created_at);
create index activity_registrations_person_idx on activity_registrations (person_id);
-- Una inscripción activa por email y actividad.
create unique index activity_registrations_email_uniq
  on activity_registrations (activity_id, email) where cancelled_at is null;

create type registration_payment_method as enum ('ath_movil', 'efectivo', 'cheque', 'otro');

create table activity_registration_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references activity_registrations (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 10000000),
  method registration_payment_method not null,
  paid_on date not null,
  reference text check (reference is null or char_length(reference) <= 100),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index activity_registration_payments_reg_idx
  on activity_registration_payments (registration_id);

create or replace function activity_registration_payments_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(new.registration_id, old.registration_id);
begin
  update activity_registrations r
     set amount_paid_cents = coalesce((
       select sum(p.amount_cents) from activity_registration_payments p where p.registration_id = v_id
     ), 0)
   where r.id = v_id;
  return null;
end;
$$;

create trigger activity_registration_payments_sync_trg
  after insert or update or delete on activity_registration_payments
  for each row
  execute function activity_registration_payments_sync();

-- ---------------------------------------------------------------------
-- RLS: solo quien organiza la actividad (can_manage_activity).
-- ---------------------------------------------------------------------

create or replace function registration_activity_id(p_registration_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.activity_id from activity_registrations r where r.id = p_registration_id;
$$;

alter table activity_registrations enable row level security;

create policy activity_registrations_select on activity_registrations
  for select
  using (can_manage_activity(activity_ministry_id(activity_id)));

-- Sin política de INSERT: solo entra por submit_activity_registration().
create policy activity_registrations_update on activity_registrations
  for update
  using (can_manage_activity(activity_ministry_id(activity_id)))
  with check (can_manage_activity(activity_ministry_id(activity_id)));

create policy activity_registrations_delete on activity_registrations
  for delete
  using (is_admin());

alter table activity_registration_payments enable row level security;

create policy activity_registration_payments_all on activity_registration_payments
  for all
  using (can_manage_activity(activity_ministry_id(registration_activity_id(registration_id))))
  with check (can_manage_activity(activity_ministry_id(registration_activity_id(registration_id))));

-- ---------------------------------------------------------------------
-- Cupo ocupado: inscripciones activas + inscritos a mano que no vienen de
-- una inscripción activa (para no contar dos veces a la misma persona).
-- ---------------------------------------------------------------------

create or replace function activity_taken_spots(p_activity_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*) from activity_registrations r
      where r.activity_id = p_activity_id and r.cancelled_at is null)
    +
    (select count(*) from activity_participants ap
      where ap.activity_id = p_activity_id
        and not exists (
          select 1 from activity_registrations r
           where r.activity_id = ap.activity_id
             and r.person_id = ap.person_id
             and r.cancelled_at is null
        ))
  )::integer;
$$;

revoke execute on function activity_taken_spots(uuid) from public, anon;
grant execute on function activity_taken_spots(uuid) to authenticated;

create or replace function church_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Puerto_Rico')::date;
$$;

-- ---------------------------------------------------------------------
-- Lectura pública de UNA actividad con inscripción abierta, por su slug.
-- Solo campos pensados para el público.
-- ---------------------------------------------------------------------

create or replace function public_registration_activity(p_slug text)
returns table (
  name text,
  description text,
  activity_date date,
  end_date date,
  start_time time,
  end_time time,
  location text,
  price_cents integer,
  deposit_cents integer,
  payment_instructions text,
  contact_info text,
  flyer_path text,
  flyer_alt text,
  is_open boolean,
  is_full boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.name, a.description, a.activity_date, a.end_date, a.start_time, a.end_time,
         a.location, a.price_cents, a.deposit_cents, a.payment_instructions, a.contact_info,
         m.storage_path, m.alt_text,
         a.status in ('planificada', 'abierta')
           and church_today() <= coalesce(a.registration_closes_on, a.activity_date)
           and church_today() <= a.activity_date,
         a.capacity is not null and activity_taken_spots(a.id) >= a.capacity
    from activities a
    left join site_media m on m.id = a.flyer_media_id
   where a.registration_slug = p_slug
     and a.registration_open;
$$;

grant execute on function public_registration_activity(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Envío público. Errores con mensajes-código que la app traduce:
-- registration_closed, activity_full, already_registered, minor, terms.
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
    insert into people (first_name, last_name, email, phone, address_line, notes)
    values (v_first, v_last, v_email, btrim(p_phone), btrim(p_address),
            'Creado desde la inscripción en línea: ' || v_activity.name)
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
    insert into people (first_name, last_name, email, phone, address_line, notes, created_by)
    values (v_reg.first_name, v_reg.last_name, v_reg.email, v_reg.phone, v_reg.address,
            'Creado desde una inscripción en línea.', auth.uid())
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

notify pgrst, 'reload schema';
