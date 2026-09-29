-- Cultos recurrentes + check-in controlado por ujieres.
--
-- Reutiliza `services` (cada fecha de culto = una fila, con su propia
-- asistencia) y `service_checkins` (una asistencia por persona y culto).
-- No se crea un segundo sistema de asistencia. Ver
-- docs/services-schedule.md y docs/roles-and-permissions.md.
--
-- Resumen:
-- 1. Capacidades (funciones SQL) derivadas de roles — ver 0031.
-- 2. `service_series` + `service_series_rules`: la recurrencia semanal,
--    versionada por fecha de vigencia (un cambio "a partir de" cierra la
--    versión anterior y abre otra; el historial no se reescribe).
-- 3. `services` gana: instante real (`starts_at`, timestamptz), estado
--    (programado/cancelado), marca de excepción manual, ventana de
--    check-in (apertura/cierre programados + control manual).
-- 4. `generate_service_occurrences()`: idempotente (índice único
--    (series_id, occurrence_date) + ON CONFLICT DO NOTHING + advisory
--    lock). Nunca actualiza ni recrea filas existentes: una ocurrencia
--    cancelada o cambiada a mano queda como está.
-- 5. Toda escritura de cultos y asistencia pasa por funciones
--    `security definer` que validan la capacidad y la ventana en la base
--    de datos. Se retiran las políticas de escritura directa, incluido el
--    auto check-in del miembro (0017).
-- 6. Asistencia anulable (nunca se borra) con motivo, y adiciones por
--    corrección; ambas auditadas en audit_log.

-- ---------------------------------------------------------------------
-- 1. Capacidades
-- ---------------------------------------------------------------------

-- Registrar asistencia. `seguimiento`, `coordinador_ministerio` y
-- `pastor` ya podían registrar check-in (0007): se conservan para no
-- dejar fuera a operadores legítimos. Ser miembro de un ministerio NO
-- concede este acceso.
create or replace function can_record_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array[
    'administrador', 'ujier', 'seguimiento', 'coordinador_ministerio', 'pastor'
  ]::app_role[]);
$$;

create or replace function can_manage_services()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['administrador', 'gestion_cultos']::app_role[]);
$$;

create or replace function can_control_checkin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['administrador', 'control_checkin']::app_role[]);
$$;

create or replace function can_correct_attendance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['administrador', 'correccion_asistencia']::app_role[]);
$$;

comment on function can_record_attendance is
  'Registrar asistencia a cultos: administrador, ujier y (preservados de '
  '0007) seguimiento, coordinador_ministerio, pastor. Ver 0032.';

-- ---------------------------------------------------------------------
-- 2. Configuración y recurrencias
-- ---------------------------------------------------------------------

create table service_schedule_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'America/Puerto_Rico',
  horizon_weeks int not null default 4 check (horizon_weeks between 1 and 26),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table service_schedule_settings is
  'Fila única. horizon_weeks = cuántas semanas hacia adelante se '
  'generan cultos recurrentes.';

insert into service_schedule_settings (id) values (true);

alter table service_schedule_settings enable row level security;

create policy service_schedule_settings_select on service_schedule_settings
  for select
  using (auth.uid() is not null);
-- Sin política de escritura: solo update_service_schedule_settings().

create or replace function church_timezone()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select timezone from service_schedule_settings where id), 'America/Puerto_Rico');
$$;

create table service_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

comment on table service_series is
  'Serie lógica de cultos (p. ej. "Culto dominical"). Sus horarios viven '
  'en service_series_rules, versionados por fecha de vigencia.';

create table service_series_rules (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references service_series (id) on delete restrict,
  name text not null,
  service_type service_type not null default 'culto_general',
  -- 0 = domingo … 6 = sábado (extract(dow)).
  weekday smallint not null check (weekday between 0 and 6),
  local_time time not null,
  location text,
  checkin_opens_minutes_before int not null default 60
    check (checkin_opens_minutes_before between 0 and 1440),
  -- NULL = sin cierre automático: el registro se cierra a mano.
  checkin_closes_minutes_after int
    check (checkin_closes_minutes_after is null or checkin_closes_minutes_after between 1 and 1440),
  effective_from date not null,
  effective_until date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  check (effective_until is null or effective_until >= effective_from)
);

create index service_series_rules_series_idx on service_series_rules (series_id, effective_from);
create unique index service_series_rules_one_open_uidx
  on service_series_rules (series_id) where effective_until is null;

comment on table service_series_rules is
  'Versión de una serie vigente entre effective_from y effective_until '
  '(inclusive; NULL = sin fin). Un cambio "a partir de" cierra la versión '
  'vigente y crea otra; nunca se edita una versión con historial.';

alter table service_series enable row level security;
alter table service_series_rules enable row level security;

create policy service_series_select on service_series
  for select using (auth.uid() is not null);
create policy service_series_rules_select on service_series_rules
  for select using (auth.uid() is not null);
-- Sin políticas de escritura: solo las funciones de gestión de cultos.

-- ---------------------------------------------------------------------
-- 3. services: instante real, estado y ventana de check-in
-- ---------------------------------------------------------------------

create type service_status as enum ('programado', 'cancelado');

alter table services
  add column series_id uuid references service_series (id) on delete restrict,
  add column series_rule_id uuid references service_series_rules (id) on delete restrict,
  add column occurrence_date date,
  add column starts_at timestamptz,
  add column status service_status not null default 'programado',
  add column is_exception boolean not null default false,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users (id) on delete set null,
  add column cancel_reason text,
  add column checkin_opens_at timestamptz,
  add column checkin_closes_at timestamptz,
  add column checkin_manual_state text check (checkin_manual_state in ('abierto', 'cerrado')),
  add column checkin_state_changed_at timestamptz,
  add column checkin_state_changed_by uuid references auth.users (id) on delete set null,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references auth.users (id) on delete set null;

comment on column services.occurrence_date is
  'Fecha programada original dentro de la serie (clave de idempotencia '
  'del generador). No cambia al reprogramar: service_date/starts_at sí.';
comment on column services.is_exception is
  'Cambiada o cancelada a mano: el generador y los cambios de serie no la tocan.';
comment on column services.checkin_manual_state is
  'NULL = sigue la programación (abre checkin_opens_at, cierra '
  'checkin_closes_at si existe). abierto/cerrado = decisión manual.';

-- Servicios existentes: su hora local se interpreta en Puerto Rico y su
-- interruptor is_checkin_open pasa a ser una decisión manual explícita.
update services set
  starts_at = (service_date + coalesce(start_time, time '00:00')) at time zone 'America/Puerto_Rico',
  checkin_manual_state = case when is_checkin_open then 'abierto' else 'cerrado' end;

update services set checkin_opens_at = starts_at - interval '60 minutes';

alter table services
  alter column starts_at set not null,
  alter column checkin_opens_at set not null,
  add constraint services_series_occurrence_check
    check ((series_id is null) = (occurrence_date is null));

-- La política de auto check-in (0017) dependía de is_checkin_open.
drop policy if exists service_checkins_insert_self on service_checkins;
alter table services drop column is_checkin_open;

create unique index services_series_occurrence_uidx
  on services (series_id, occurrence_date) where series_id is not null;
create index services_starts_at_idx on services (starts_at);

-- service_date/start_time se derivan siempre de starts_at en la zona de
-- la iglesia: reportes y listados existentes siguen funcionando igual.
create or replace function services_sync_local_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := church_timezone();
begin
  new.service_date := (new.starts_at at time zone v_tz)::date;
  new.start_time := (new.starts_at at time zone v_tz)::time;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger services_sync_local_fields_trg
  before insert or update on services
  for each row
  execute function services_sync_local_fields();

-- Escritura directa retirada: solo funciones con validación y auditoría.
drop policy if exists services_write_staff on services;

create or replace function service_checkin_state(s services)
returns text
language sql
stable
as $$
  select case
    when s.status = 'cancelado' then 'cancelado'
    when s.checkin_manual_state = 'cerrado' then 'cerrado'
    when s.checkin_manual_state = 'abierto' then 'abierto'
    when now() < s.checkin_opens_at then 'pendiente'
    when s.checkin_closes_at is not null and now() >= s.checkin_closes_at then 'cerrado'
    else 'abierto'
  end;
$$;

comment on function service_checkin_state is
  'abierto | pendiente | cerrado | cancelado. Única fuente de verdad de '
  'la ventana de registro (la usa record_service_attendance).';

-- ---------------------------------------------------------------------
-- 4. service_checkins: anulación y correcciones (nunca se borra)
-- ---------------------------------------------------------------------

alter table service_checkins
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users (id) on delete set null,
  add column void_reason text,
  add column is_correction boolean not null default false,
  add column correction_reason text,
  add constraint service_checkins_void_reason_check
    check (voided_at is null or length(trim(coalesce(void_reason, ''))) > 0),
  add constraint service_checkins_correction_reason_check
    check (not is_correction or length(trim(coalesce(correction_reason, ''))) > 0);

-- Una asistencia VIGENTE por persona y culto (una anulada no bloquea).
alter table service_checkins drop constraint if exists service_checkins_service_id_person_id_key;
create unique index service_checkins_one_active_uidx
  on service_checkins (service_id, person_id) where voided_at is null;

-- Escritura directa retirada (incluido el auto check-in del miembro).
drop policy if exists service_checkins_insert_staff on service_checkins;
drop policy if exists service_checkins_delete_staff on service_checkins;
-- service_checkins_select (staff o la propia persona) se conserva.

-- ---------------------------------------------------------------------
-- 5. Generación de ocurrencias
-- ---------------------------------------------------------------------

create or replace function generate_service_occurrences(p_today date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := church_timezone();
  v_weeks int;
  v_today date;
  v_until date;
  v_created int;
begin
  -- Serializa ejecuciones simultáneas (cron + página abierta, dos cron…).
  perform pg_advisory_xact_lock(hashtext('generate_service_occurrences'));

  select horizon_weeks into v_weeks from service_schedule_settings where id;
  v_weeks := coalesce(v_weeks, 4);
  v_today := coalesce(p_today, (now() at time zone v_tz)::date);
  v_until := v_today + v_weeks * 7;

  insert into services (
    name, service_type, service_date, start_time, location,
    series_id, series_rule_id, occurrence_date,
    starts_at, checkin_opens_at, checkin_closes_at
  )
  select
    r.name,
    r.service_type,
    d.day,
    r.local_time,
    r.location,
    r.series_id,
    r.id,
    d.day,
    (d.day + r.local_time) at time zone v_tz,
    ((d.day + r.local_time) at time zone v_tz) - make_interval(mins => r.checkin_opens_minutes_before),
    case
      when r.checkin_closes_minutes_after is null then null
      else ((d.day + r.local_time) at time zone v_tz) + make_interval(mins => r.checkin_closes_minutes_after)
    end
  from service_series_rules r
  cross join lateral (
    select g::date as day
    from generate_series(
      greatest(v_today, r.effective_from)::timestamp,
      least(v_until, coalesce(r.effective_until, v_until))::timestamp,
      interval '1 day'
    ) g
  ) d
  where extract(dow from d.day) = r.weekday
  on conflict (series_id, occurrence_date) where series_id is not null do nothing;

  get diagnostics v_created = row_count;
  return v_created;
end;
$$;

comment on function generate_service_occurrences is
  'Crea las ocurrencias faltantes desde hoy (hora de PR) hasta '
  'horizon_weeks. Idempotente y segura en concurrencia; nunca modifica '
  'ni recrea filas existentes (canceladas o cambiadas a mano). La '
  'ejecuta pg_cron (0033) y, de respaldo, ensure_service_occurrences().';

revoke all on function generate_service_occurrences(date) from public, anon, authenticated;

-- Respaldo desde la app (al abrir Asistencia / Programación): solo para
-- quien opera cultos. No acepta parámetros.
create or replace function ensure_service_occurrences()
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (can_record_attendance() or can_manage_services() or can_control_checkin()
          or can_correct_attendance()) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return generate_service_occurrences();
end;
$$;

revoke all on function ensure_service_occurrences() from public, anon;
grant execute on function ensure_service_occurrences() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Lecturas para las pantallas
-- ---------------------------------------------------------------------

create or replace function list_services_with_state(
  p_from date default null,
  p_to date default null,
  p_service_id uuid default null
)
returns table (
  id uuid,
  name text,
  service_type service_type,
  service_date date,
  start_time time,
  starts_at timestamptz,
  location text,
  status service_status,
  is_exception boolean,
  series_id uuid,
  occurrence_date date,
  checkin_opens_at timestamptz,
  checkin_closes_at timestamptz,
  checkin_manual_state text,
  checkin_state text,
  cancel_reason text,
  attendance bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  return query
    select
      s.id, s.name, s.service_type, s.service_date, s.start_time, s.starts_at,
      s.location, s.status, s.is_exception, s.series_id, s.occurrence_date,
      s.checkin_opens_at, s.checkin_closes_at, s.checkin_manual_state,
      service_checkin_state(s),
      s.cancel_reason,
      case
        when can_record_attendance() or can_correct_attendance() or is_staff() then
          (select count(*) from service_checkins c where c.service_id = s.id and c.voided_at is null)
        else null
      end
    from services s
    where (p_service_id is null or s.id = p_service_id)
      and (p_from is null or s.service_date >= p_from)
      and (p_to is null or s.service_date <= p_to)
    order by s.starts_at, s.name;
end;
$$;

revoke all on function list_services_with_state(date, date, uuid) from public, anon;
grant execute on function list_services_with_state(date, date, uuid) to authenticated;

-- Búsqueda mínima para check-in: nombre + una pista discreta para
-- distinguir homónimos. Nunca devuelve el directorio completo (mín. 2
-- caracteres, máx. 25 filas) ni datos de contacto completos.
create or replace function search_people_for_checkin(
  p_service_id uuid,
  p_query text,
  p_limit int default 15
)
returns table (
  person_id uuid,
  display_name text,
  hint text,
  membership_status membership_status,
  already_checked_in boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text;
  v_terms text[];
begin
  if not can_record_attendance() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  v_q := lower(trim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')));
  if length(v_q) < 2 then
    return;
  end if;
  v_terms := string_to_array(v_q, ' ');

  return query
    select
      p.id,
      p.first_name || ' ' || p.last_name,
      case
        when length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 4 then
          'Tel. termina en ' || right(regexp_replace(p.phone, '\D', '', 'g'), 4)
        when p.email is not null then
          left(p.email::text, 1) || '•••@' || split_part(p.email::text, '@', 2)
        else null
      end,
      p.membership_status,
      exists (
        select 1 from service_checkins c
        where c.service_id = p_service_id and c.person_id = p.id and c.voided_at is null
      )
    from people p
    where not exists (
      select 1 from unnest(v_terms) t
      where position(t in lower(
        p.first_name || ' ' || p.last_name || ' ' || coalesce(p.preferred_name, '')
      )) = 0
    )
    order by
      (lower(p.first_name || ' ' || p.last_name) like v_q || '%') desc,
      p.last_name, p.first_name, p.id
    limit least(greatest(coalesce(p_limit, 15), 1), 25);
end;
$$;

revoke all on function search_people_for_checkin(uuid, text, int) from public, anon;
grant execute on function search_people_for_checkin(uuid, text, int) to authenticated;

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
  if not (can_record_attendance() or v_detail or is_staff()) then
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

revoke all on function list_service_attendance(uuid, boolean) from public, anon;
grant execute on function list_service_attendance(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Registro de asistencia (ujier)
-- ---------------------------------------------------------------------

create or replace function record_service_attendance(
  p_service_id uuid,
  p_person_id uuid,
  p_method checkin_method
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service services%rowtype;
  v_state text;
  v_name text;
  v_id uuid;
  v_at timestamptz;
  v_by uuid;
begin
  if not can_record_attendance() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  -- FOR SHARE: un cierre/cancelación simultáneo espera a este registro
  -- (o este ve el estado ya cerrado), nunca a medias.
  select * into v_service from services where id = p_service_id for share;
  if not found then
    raise exception 'SERVICIO_NO_ENCONTRADO: No se encontró el culto.';
  end if;

  v_state := service_checkin_state(v_service);
  if v_state = 'cancelado' then
    raise exception 'CHECKIN_CANCELADO: Este culto fue cancelado; no acepta registros.';
  elsif v_state = 'pendiente' then
    raise exception 'CHECKIN_PENDIENTE: El registro de este culto todavía no abre.';
  elsif v_state = 'cerrado' then
    raise exception 'CHECKIN_CERRADO: El registro de este culto está cerrado.';
  end if;

  select first_name || ' ' || last_name into v_name from people where id = p_person_id;
  if v_name is null then
    raise exception 'PERSONA_NO_ENCONTRADA: No se encontró a esta persona.';
  end if;

  insert into service_checkins (service_id, person_id, method, checked_in_by)
  values (p_service_id, p_person_id, p_method, auth.uid())
  on conflict (service_id, person_id) where voided_at is null do nothing
  returning id, checked_in_at into v_id, v_at;

  if v_id is not null then
    return jsonb_build_object(
      'result', 'registrado', 'checkin_id', v_id, 'checked_in_at', v_at,
      'person_name', v_name, 'by_me', true
    );
  end if;

  select id, checked_in_at, checked_in_by into v_id, v_at, v_by
    from service_checkins
    where service_id = p_service_id and person_id = p_person_id and voided_at is null;

  return jsonb_build_object(
    'result', 'ya_registrado', 'checkin_id', v_id, 'checked_in_at', v_at,
    'person_name', v_name, 'by_me', v_by is not distinct from auth.uid()
  );
end;
$$;

comment on function record_service_attendance is
  'Registro ordinario: valida capacidad y ventana en la base. Idempotente '
  '(índice único parcial): un segundo intento devuelve ya_registrado.';

revoke all on function record_service_attendance(uuid, uuid, checkin_method) from public, anon;
grant execute on function record_service_attendance(uuid, uuid, checkin_method) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Control del registro y correcciones
-- ---------------------------------------------------------------------

create or replace function set_service_checkin_state(p_service_id uuid, p_state text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service services%rowtype;
begin
  if not can_control_checkin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_state not in ('abierto', 'cerrado') then
    raise exception 'DATOS_INVALIDOS: Estado inválido.';
  end if;

  select * into v_service from services where id = p_service_id for update;
  if not found then
    raise exception 'SERVICIO_NO_ENCONTRADO: No se encontró el culto.';
  end if;
  if v_service.status = 'cancelado' then
    raise exception 'CHECKIN_CANCELADO: Este culto fue cancelado.';
  end if;

  update services set
    checkin_manual_state = p_state,
    checkin_state_changed_at = now(),
    checkin_state_changed_by = auth.uid(),
    updated_by = auth.uid()
  where id = p_service_id;

  perform log_audit_event(
    case p_state when 'abierto' then 'open_checkin' else 'close_checkin' end,
    'services', p_service_id,
    jsonb_build_object('previous_state', service_checkin_state(v_service))
  );
end;
$$;

revoke all on function set_service_checkin_state(uuid, text) from public, anon;
grant execute on function set_service_checkin_state(uuid, text) to authenticated;

create or replace function correct_attendance_add(
  p_service_id uuid,
  p_person_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service services%rowtype;
  v_name text;
  v_id uuid;
  v_at timestamptz;
begin
  if not can_correct_attendance() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DATOS_INVALIDOS: Escribe el motivo de la corrección (mínimo 5 caracteres).';
  end if;

  select * into v_service from services where id = p_service_id for share;
  if not found then
    raise exception 'SERVICIO_NO_ENCONTRADO: No se encontró el culto.';
  end if;
  if v_service.status = 'cancelado' then
    raise exception 'CHECKIN_CANCELADO: Este culto fue cancelado.';
  end if;

  select first_name || ' ' || last_name into v_name from people where id = p_person_id;
  if v_name is null then
    raise exception 'PERSONA_NO_ENCONTRADA: No se encontró a esta persona.';
  end if;

  insert into service_checkins (
    service_id, person_id, method, checked_in_by, is_correction, correction_reason
  )
  values (p_service_id, p_person_id, 'manual', auth.uid(), true, trim(p_reason))
  on conflict (service_id, person_id) where voided_at is null do nothing
  returning id, checked_in_at into v_id, v_at;

  if v_id is null then
    return jsonb_build_object('result', 'ya_registrado', 'person_name', v_name);
  end if;

  perform log_audit_event(
    'attendance_correction_add', 'service_checkins', v_id,
    jsonb_build_object('service_id', p_service_id, 'person_id', p_person_id,
                       'reason', trim(p_reason), 'checkin_state', service_checkin_state(v_service))
  );

  return jsonb_build_object(
    'result', 'registrado', 'checkin_id', v_id, 'checked_in_at', v_at, 'person_name', v_name
  );
end;
$$;

revoke all on function correct_attendance_add(uuid, uuid, text) from public, anon;
grant execute on function correct_attendance_add(uuid, uuid, text) to authenticated;

create or replace function void_service_attendance(p_checkin_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row service_checkins%rowtype;
begin
  if not can_correct_attendance() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DATOS_INVALIDOS: Escribe el motivo de la corrección (mínimo 5 caracteres).';
  end if;

  select * into v_row from service_checkins where id = p_checkin_id for update;
  if not found then
    raise exception 'REGISTRO_NO_ENCONTRADO: No se encontró el registro.';
  end if;
  if v_row.voided_at is not null then
    raise exception 'YA_ANULADO: Este registro ya estaba anulado.';
  end if;

  update service_checkins set
    voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_checkin_id;

  perform log_audit_event(
    'attendance_void', 'service_checkins', p_checkin_id,
    jsonb_build_object('service_id', v_row.service_id, 'person_id', v_row.person_id,
                       'reason', trim(p_reason), 'original_method', v_row.method,
                       'original_checked_in_at', v_row.checked_in_at,
                       'original_checked_in_by', v_row.checked_in_by)
  );
end;
$$;

revoke all on function void_service_attendance(uuid, text) from public, anon;
grant execute on function void_service_attendance(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Gestión de cultos (gestion_cultos / administrador)
-- ---------------------------------------------------------------------

create or replace function create_special_service(
  p_name text,
  p_service_type service_type,
  p_local_date date,
  p_local_time time,
  p_location text default null,
  p_closes_minutes_after int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := church_timezone();
  v_starts timestamptz;
  v_id uuid;
begin
  if not can_manage_services() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 or p_local_date is null or p_local_time is null then
    raise exception 'DATOS_INVALIDOS: Nombre, fecha y hora son requeridos.';
  end if;
  if p_closes_minutes_after is not null and p_closes_minutes_after not between 1 and 1440 then
    raise exception 'DATOS_INVALIDOS: El cierre automático debe estar entre 1 y 1440 minutos.';
  end if;

  v_starts := (p_local_date + p_local_time) at time zone v_tz;

  insert into services (
    name, service_type, service_date, start_time, location, starts_at,
    checkin_opens_at, checkin_closes_at, is_exception, created_by, updated_by
  )
  values (
    trim(p_name), p_service_type, p_local_date, p_local_time, nullif(trim(p_location), ''),
    v_starts, v_starts - interval '60 minutes',
    case when p_closes_minutes_after is null then null
         else v_starts + make_interval(mins => p_closes_minutes_after) end,
    true, auth.uid(), auth.uid()
  )
  returning id into v_id;

  perform log_audit_event('create_special_service', 'services', v_id,
    jsonb_build_object('name', trim(p_name), 'starts_at', v_starts));
  return v_id;
end;
$$;

revoke all on function create_special_service(text, service_type, date, time, text, int) from public, anon;
grant execute on function create_special_service(text, service_type, date, time, text, int) to authenticated;

create or replace function cancel_service(p_service_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service services%rowtype;
begin
  if not can_manage_services() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into v_service from services where id = p_service_id for update;
  if not found then
    raise exception 'SERVICIO_NO_ENCONTRADO: No se encontró el culto.';
  end if;
  if v_service.status = 'cancelado' then
    raise exception 'YA_CANCELADO: Este culto ya estaba cancelado.';
  end if;

  update services set
    status = 'cancelado', is_exception = true,
    cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = nullif(trim(coalesce(p_reason, '')), ''),
    updated_by = auth.uid()
  where id = p_service_id;

  perform log_audit_event('cancel_service', 'services', p_service_id,
    jsonb_build_object('reason', p_reason, 'starts_at', v_service.starts_at));
end;
$$;

revoke all on function cancel_service(uuid, text) from public, anon;
grant execute on function cancel_service(uuid, text) to authenticated;

create or replace function reinstate_service(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service services%rowtype;
begin
  if not can_manage_services() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into v_service from services where id = p_service_id for update;
  if not found then
    raise exception 'SERVICIO_NO_ENCONTRADO: No se encontró el culto.';
  end if;
  if v_service.status <> 'cancelado' then
    raise exception 'NO_CANCELADO: Este culto no está cancelado.';
  end if;

  -- Sigue siendo excepción: el generador no debe tocarlo.
  update services set
    status = 'programado', cancelled_at = null, cancelled_by = null, cancel_reason = null,
    updated_by = auth.uid()
  where id = p_service_id;

  perform log_audit_event('reinstate_service', 'services', p_service_id,
    jsonb_build_object('previous_cancel_reason', v_service.cancel_reason));
end;
$$;

revoke all on function reinstate_service(uuid) from public, anon;
grant execute on function reinstate_service(uuid) to authenticated;

create or replace function reschedule_service(
  p_service_id uuid,
  p_local_date date,
  p_local_time time,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := church_timezone();
  v_service services%rowtype;
  v_starts timestamptz;
begin
  if not can_manage_services() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_local_date is null or p_local_time is null then
    raise exception 'DATOS_INVALIDOS: Fecha y hora son requeridas.';
  end if;
  select * into v_service from services where id = p_service_id for update;
  if not found then
    raise exception 'SERVICIO_NO_ENCONTRADO: No se encontró el culto.';
  end if;
  if v_service.status = 'cancelado' then
    raise exception 'CHECKIN_CANCELADO: Reactiva el culto antes de cambiar su horario.';
  end if;

  v_starts := (p_local_date + p_local_time) at time zone v_tz;

  -- Conserva la misma anticipación de apertura y la misma duración hasta
  -- el cierre automático (si lo había).
  update services set
    starts_at = v_starts,
    checkin_opens_at = v_starts - (v_service.starts_at - v_service.checkin_opens_at),
    checkin_closes_at = case when v_service.checkin_closes_at is null then null
                             else v_starts + (v_service.checkin_closes_at - v_service.starts_at) end,
    is_exception = true,
    updated_by = auth.uid()
  where id = p_service_id;

  perform log_audit_event('reschedule_service', 'services', p_service_id,
    jsonb_build_object('from', v_service.starts_at, 'to', v_starts, 'reason', p_reason));
end;
$$;

revoke all on function reschedule_service(uuid, date, time, text) from public, anon;
grant execute on function reschedule_service(uuid, date, time, text) to authenticated;

-- Cambio de una serie "a partir de" una fecha. Lo anterior (cultos y
-- asistencia) no se toca. Las ocurrencias futuras aún no modificadas a
-- mano y SIN ningún registro de asistencia se regeneran con el nuevo
-- horario; las que ya tienen asistencia o son excepciones se conservan.
create or replace function update_service_series(
  p_series_id uuid,
  p_effective_from date,
  p_name text,
  p_service_type service_type,
  p_weekday int,
  p_local_time time,
  p_location text,
  p_opens_minutes_before int,
  p_closes_minutes_after int,
  p_end_series boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := church_timezone();
  v_today date := (now() at time zone v_tz)::date;
  v_latest service_series_rules%rowtype;
  v_new_rule uuid;
  v_removed int;
  v_kept int;
  v_created int;
begin
  if not can_manage_services() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_effective_from is null or p_effective_from < v_today then
    raise exception 'DATOS_INVALIDOS: El cambio debe aplicar desde hoy o una fecha futura.';
  end if;

  perform pg_advisory_xact_lock(hashtext('generate_service_occurrences'));

  select * into v_latest from service_series_rules
    where series_id = p_series_id
    order by effective_from desc
    limit 1
    for update;
  if not found then
    raise exception 'SERIE_NO_ENCONTRADA: No se encontró la serie.';
  end if;
  if p_effective_from <= v_latest.effective_from then
    raise exception 'DATOS_INVALIDOS: La fecha debe ser posterior al %, inicio del horario vigente.',
      to_char(v_latest.effective_from, 'DD/MM/YYYY');
  end if;

  if not p_end_series then
    if length(trim(coalesce(p_name, ''))) = 0 or p_weekday not between 0 and 6
       or p_local_time is null then
      raise exception 'DATOS_INVALIDOS: Nombre, día y hora son requeridos.';
    end if;
    if p_opens_minutes_before is null or p_opens_minutes_before not between 0 and 1440 then
      raise exception 'DATOS_INVALIDOS: La apertura debe estar entre 0 y 1440 minutos antes.';
    end if;
    if p_closes_minutes_after is not null and p_closes_minutes_after not between 1 and 1440 then
      raise exception 'DATOS_INVALIDOS: El cierre automático debe estar entre 1 y 1440 minutos.';
    end if;
  end if;

  if v_latest.effective_until is null or v_latest.effective_until >= p_effective_from then
    update service_series_rules set effective_until = p_effective_from - 1
      where id = v_latest.id;
  end if;

  if not p_end_series then
    insert into service_series_rules (
      series_id, name, service_type, weekday, local_time, location,
      checkin_opens_minutes_before, checkin_closes_minutes_after,
      effective_from, created_by
    )
    values (
      p_series_id, trim(p_name), p_service_type, p_weekday, p_local_time,
      nullif(trim(coalesce(p_location, '')), ''),
      p_opens_minutes_before, p_closes_minutes_after, p_effective_from, auth.uid()
    )
    returning id into v_new_rule;

    update service_series set name = trim(p_name) where id = p_series_id;
  end if;

  select count(*) into v_kept from services s
    where s.series_id = p_series_id and s.occurrence_date >= p_effective_from
      and (s.is_exception or exists (select 1 from service_checkins c where c.service_id = s.id));

  delete from services s
    where s.series_id = p_series_id
      and s.occurrence_date >= p_effective_from
      and not s.is_exception
      and not exists (select 1 from service_checkins c where c.service_id = s.id);
  get diagnostics v_removed = row_count;

  v_created := generate_service_occurrences();

  perform log_audit_event(
    case when p_end_series then 'end_service_series' else 'update_service_series' end,
    'service_series', p_series_id,
    jsonb_build_object(
      'effective_from', p_effective_from,
      'previous_rule', to_jsonb(v_latest),
      'new_rule_id', v_new_rule,
      'regenerated_removed', v_removed,
      'kept', v_kept
    )
  );

  return jsonb_build_object('removed', v_removed, 'kept', v_kept, 'created', v_created,
                            'new_rule_id', v_new_rule);
end;
$$;

revoke all on function update_service_series(uuid, date, text, service_type, int, time, text, int, int, boolean) from public, anon;
grant execute on function update_service_series(uuid, date, text, service_type, int, time, text, int, int, boolean) to authenticated;

create or replace function update_service_schedule_settings(p_horizon_weeks int)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_manage_services() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_horizon_weeks is null or p_horizon_weeks not between 1 and 26 then
    raise exception 'DATOS_INVALIDOS: El horizonte debe estar entre 1 y 26 semanas.';
  end if;

  update service_schedule_settings
    set horizon_weeks = p_horizon_weeks, updated_at = now(), updated_by = auth.uid()
    where id;

  perform log_audit_event('update_service_schedule_settings', 'service_schedule_settings', null,
    jsonb_build_object('horizon_weeks', p_horizon_weeks));

  -- Ampliar el horizonte genera lo que falta; reducirlo no borra nada.
  return generate_service_occurrences();
end;
$$;

revoke all on function update_service_schedule_settings(int) from public, anon;
grant execute on function update_service_schedule_settings(int) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Reporte por fecha y tipo de culto (security invoker: respeta RLS)
-- ---------------------------------------------------------------------

create or replace function service_attendance_report(
  p_from date,
  p_to date,
  p_service_type service_type default null
)
returns table (
  service_id uuid,
  name text,
  service_type service_type,
  service_date date,
  start_time time,
  attendance bigint
)
language sql
stable
set search_path = public
as $$
  select s.id, s.name, s.service_type, s.service_date, s.start_time,
    (select count(*) from service_checkins c where c.service_id = s.id and c.voided_at is null)
  from services s
  where s.service_date between p_from and p_to
    and s.status = 'programado'
    and s.starts_at <= now() + interval '1 day'
    and (p_service_type is null or s.service_type = p_service_type)
  order by s.starts_at;
$$;

create or replace function service_attendance_unique_people(
  p_from date,
  p_to date,
  p_service_type service_type default null
)
returns bigint
language sql
stable
set search_path = public
as $$
  select count(distinct c.person_id)
  from service_checkins c
  join services s on s.id = c.service_id
  where c.voided_at is null
    and s.status = 'programado'
    and s.service_date between p_from and p_to
    and (p_service_type is null or s.service_type = p_service_type);
$$;

revoke all on function service_attendance_report(date, date, service_type) from public, anon;
grant execute on function service_attendance_report(date, date, service_type) to authenticated;
revoke all on function service_attendance_unique_people(date, date, service_type) from public, anon;
grant execute on function service_attendance_unique_people(date, date, service_type) to authenticated;

-- ---------------------------------------------------------------------
-- 11. Programación inicial de la iglesia (hora de Puerto Rico)
-- ---------------------------------------------------------------------

do $$
declare
  v_id uuid;
begin
  insert into service_series (name) values ('Culto dominical') returning id into v_id;
  insert into service_series_rules (series_id, name, service_type, weekday, local_time, effective_from)
    values (v_id, 'Culto dominical', 'culto_general', 0, time '09:30', date '2026-09-01');

  insert into service_series (name) values ('Culto de miércoles') returning id into v_id;
  insert into service_series_rules (series_id, name, service_type, weekday, local_time, effective_from)
    values (v_id, 'Culto de miércoles', 'culto_general', 3, time '19:30', date '2026-09-01');

  insert into service_series (name) values ('Culto de jóvenes') returning id into v_id;
  insert into service_series_rules (series_id, name, service_type, weekday, local_time, effective_from)
    values (v_id, 'Culto de jóvenes', 'jovenes', 5, time '19:30', date '2026-09-01');
end;
$$;

select generate_service_occurrences();
