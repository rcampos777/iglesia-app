-- Donaciones y Finanzas. Ver docs/finance.md y docs/roles-and-permissions.md §7.
--
-- Principios:
-- 1. Solo `apostol` y `finanzas` ven datos financieros (donaciones,
--    montos, totales, historial por persona, cartas, exportaciones). Un
--    `administrador` técnico NO. Toda lectura/escritura se valida en la
--    base (RLS + funciones security definer con chequeo explícito).
-- 2. Solo un `apostol` concede o revoca `apostol`/`finanzas`. Un trigger en
--    user_roles bloquea cualquier otra vía (incluida admin_set_person_roles)
--    y protege al último apostol. El alta inicial es un procedimiento
--    explícito por SQL (bootstrap_first_apostol), no automático.
-- 3. Dinero en centavos enteros (bigint). Totales con sum() en la base.
-- 4. Nunca se borra una donación: correcciones y anulaciones con motivo,
--    versión (control de concurrencia) y revisión inmutable.
-- 5. La petición de oración del sobre vive en otra tabla, sin políticas de
--    lectura: solo se lee por función auditada. Nunca aparece en listados,
--    reportes, exportaciones, cartas, auditoría general ni mensajes de
--    error. Compartir con intercesión exige autorización registrada por el
--    operador y copia SOLO el texto + la identidad a prayer_requests.
-- 6. La auditoría financiera va a finance_audit_log (solo apostol), no a
--    audit_log (que lee el administrador), para no filtrar montos.

-- ---------------------------------------------------------------------
-- 1. Capacidades
-- ---------------------------------------------------------------------

create or replace function is_apostol()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_role('apostol');
$$;

create or replace function has_finance_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['apostol', 'finanzas']::app_role[]);
$$;

comment on function has_finance_access is
  'Acceso financiero: solo apostol o finanzas. administrador NO. Ver 0035.';

-- ---------------------------------------------------------------------
-- 2. Protección de los roles financieros en user_roles
-- ---------------------------------------------------------------------

create or replace function user_roles_guard_financial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin boolean :=
    (tg_op <> 'DELETE' and new.role in ('apostol', 'finanzas'))
    or (tg_op <> 'INSERT' and old.role in ('apostol', 'finanzas'));
begin
  if not v_fin then
    return coalesce(new, old);
  end if;

  -- Solo las funciones autorizadas activan este indicador, y solo dentro
  -- de su propia transacción (set_config(..., true)).
  if coalesce(current_setting('app.financial_role_change', true), '') <> 'on' then
    -- Excepción: borrado en cascada porque se eliminó la cuenta de auth.
    if not (tg_op = 'DELETE' and not exists (select 1 from auth.users where id = old.user_id)) then
      raise exception 'Los accesos Apóstol y Finanzas solo los gestiona un Apóstol.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op in ('DELETE', 'UPDATE') and old.role = 'apostol'
     and (tg_op = 'DELETE' or new.role <> 'apostol' or new.user_id <> old.user_id) then
    perform pg_advisory_xact_lock(hashtext('user_roles_last_apostol_guard'));
    if not exists (
      select 1 from user_roles where role = 'apostol' and user_id <> old.user_id
    ) then
      raise exception 'No se puede quitar el acceso Apóstol a la última cuenta que lo tiene.'
        using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger user_roles_guard_financial_trg
  before insert or update or delete on user_roles
  for each row
  execute function user_roles_guard_financial();

-- admin_set_person_roles (0030) deja de poder tocar roles financieros: los
-- ignora al comparar y rechaza cualquier intento de cambiarlos. Mismo
-- comportamiento que antes para los demás roles.
create or replace function admin_set_person_roles(
  p_person_id uuid,
  p_expected_roles app_role[],
  p_new_roles app_role[],
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin constant app_role[] := array['apostol', 'finanzas']::app_role[];
  v_user_id uuid;
  v_actor uuid := auth.uid();
  v_current app_role[];
  v_expected_sorted app_role[];
  v_new_sorted app_role[];
  v_to_add app_role[];
  v_to_remove app_role[];
  v_role app_role;
  v_remaining_admins int;
begin
  if not is_admin() then
    raise exception 'No autorizado.';
  end if;

  if (select coalesce(array_agg(distinct r order by r), '{}') from unnest(p_new_roles) r where r = any (v_fin))
     is distinct from
     (select coalesce(array_agg(distinct r order by r), '{}') from unnest(p_expected_roles) r where r = any (v_fin)) then
    raise exception 'Los accesos Apóstol y Finanzas solo los gestiona un Apóstol.'
      using errcode = '42501';
  end if;

  select id into v_user_id from profiles where person_id = p_person_id;
  if v_user_id is null then
    raise exception 'Esta persona no tiene una cuenta vinculada.';
  end if;

  select coalesce(array_agg(distinct r order by r), '{}') into v_expected_sorted
    from unnest(p_expected_roles) as r where r <> all (v_fin);
  select coalesce(array_agg(distinct r order by r), '{}') into v_new_sorted
    from unnest(p_new_roles) as r where r <> all (v_fin);

  if v_expected_sorted = v_new_sorted then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_set_person_roles:' || v_user_id::text));

  select coalesce(array_agg(role order by role), '{}') into v_current
    from user_roles where user_id = v_user_id and role <> all (v_fin);

  if v_current is distinct from v_expected_sorted then
    raise exception 'STALE_ROLES: los permisos de esta cuenta cambiaron mientras editabas. Recarga e intenta de nuevo.';
  end if;

  select coalesce(array_agg(r), '{}') into v_to_add
    from unnest(v_new_sorted) as r where r <> all (v_current);
  select coalesce(array_agg(r), '{}') into v_to_remove
    from unnest(v_current) as r where r <> all (v_new_sorted);

  if 'administrador' = any (v_to_remove) then
    select count(*) into v_remaining_admins
      from user_roles
      where role = 'administrador' and user_id <> v_user_id;
    if v_remaining_admins = 0 then
      raise exception 'No puedes quitar el rol de administrador a la última cuenta que lo tiene.';
    end if;
  end if;

  foreach v_role in array v_to_remove loop
    delete from user_roles where user_id = v_user_id and role = v_role;
  end loop;

  foreach v_role in array v_to_add loop
    insert into user_roles (user_id, role, granted_by)
    values (v_user_id, v_role, v_actor)
    on conflict do nothing;
  end loop;

  perform log_audit_event(
    'update_roles',
    'user_roles',
    v_user_id,
    jsonb_build_object(
      'person_id', p_person_id,
      'before', to_jsonb(v_current),
      'after', to_jsonb(v_new_sorted),
      'added', to_jsonb(v_to_add),
      'removed', to_jsonb(v_to_remove),
      'reason', p_reason
    )
  );
end;
$$;

revoke all on function admin_set_person_roles(uuid, app_role[], app_role[], text) from public;
grant execute on function admin_set_person_roles(uuid, app_role[], app_role[], text) to authenticated;

-- Única vía en la app para conceder/revocar apostol y finanzas.
create or replace function apostol_set_financial_role(
  p_user_id uuid,
  p_role app_role,
  p_grant boolean,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has boolean;
begin
  if not is_apostol() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_role not in ('apostol', 'finanzas') then
    raise exception 'DATOS_INVALIDOS: Rol no financiero.';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'DATOS_INVALIDOS: Cuenta no encontrada.';
  end if;

  perform pg_advisory_xact_lock(hashtext('financial_roles:' || p_user_id::text));
  select exists (select 1 from user_roles where user_id = p_user_id and role = p_role) into v_has;
  if v_has = p_grant then
    return 'sin_cambios';
  end if;

  perform set_config('app.financial_role_change', 'on', true);
  if p_grant then
    insert into user_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid());
  else
    delete from user_roles where user_id = p_user_id and role = p_role;
  end if;
  perform set_config('app.financial_role_change', 'off', true);

  perform log_audit_event(
    case when p_grant then 'grant_financial_role' else 'revoke_financial_role' end,
    'user_roles', p_user_id,
    jsonb_build_object('role', p_role, 'reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
  return case when p_grant then 'concedido' else 'revocado' end;
end;
$$;

revoke all on function apostol_set_financial_role(uuid, app_role, boolean, text) from public, anon;
grant execute on function apostol_set_financial_role(uuid, app_role, boolean, text) to authenticated;

-- Alta inicial del primer Apóstol: solo desde el SQL Editor de Supabase
-- (rol postgres). No la puede ejecutar ningún usuario de la app, ni
-- service_role vía API. Se niega si ya existe un apostol.
create or replace function bootstrap_first_apostol(p_user_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from user_roles where role = 'apostol') then
    raise exception 'Ya existe un Apóstol. Los cambios se hacen desde la app (Finanzas → Acceso).';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Cuenta no encontrada.';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Escribe una nota con quién autorizó esta alta.';
  end if;

  perform set_config('app.financial_role_change', 'on', true);
  insert into user_roles (user_id, role, granted_by) values (p_user_id, 'apostol', null);
  perform set_config('app.financial_role_change', 'off', true);

  insert into audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (null, 'bootstrap_first_apostol', 'user_roles', p_user_id,
          jsonb_build_object('note', trim(p_note)));
end;
$$;

revoke all on function bootstrap_first_apostol(uuid, text) from public, anon, authenticated, service_role;

create or replace function finance_list_role_holders()
returns table (
  user_id uuid,
  display_name text,
  email text,
  role app_role,
  granted_at timestamptz,
  granted_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_apostol() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return query
    select ur.user_id,
      coalesce(pe.first_name || ' ' || pe.last_name, pr.display_name, u.email::text),
      u.email::text,
      ur.role,
      ur.granted_at,
      (select gp.first_name || ' ' || gp.last_name
         from profiles gpr join people gp on gp.id = gpr.person_id
         where gpr.id = ur.granted_by)
    from user_roles ur
    join auth.users u on u.id = ur.user_id
    left join profiles pr on pr.id = ur.user_id
    left join people pe on pe.id = pr.person_id
    where ur.role in ('apostol', 'finanzas')
    order by ur.role, 2;
end;
$$;

revoke all on function finance_list_role_holders() from public, anon;
grant execute on function finance_list_role_holders() to authenticated;

create or replace function finance_search_accounts(p_query text)
returns table (user_id uuid, display_name text, email text, roles app_role[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
begin
  if not is_apostol() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if length(v_q) < 2 then
    return;
  end if;
  return query
    select u.id,
      coalesce(pe.first_name || ' ' || pe.last_name, pr.display_name, u.email::text),
      u.email::text,
      coalesce((select array_agg(r.role order by r.role) from user_roles r
                where r.user_id = u.id and r.role in ('apostol', 'finanzas')), '{}')
    from auth.users u
    left join profiles pr on pr.id = u.id
    left join people pe on pe.id = pr.person_id
    where position(v_q in lower(coalesce(pe.first_name || ' ' || pe.last_name, '') || ' '
                   || coalesce(u.email::text, ''))) > 0
    order by 2
    limit 20;
end;
$$;

revoke all on function finance_search_accounts(text) from public, anon;
grant execute on function finance_search_accounts(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Tablas
-- ---------------------------------------------------------------------

create type donation_type as enum ('diezmo', 'ofrenda', 'semilla', 'primicias');
create type donation_payment_method as enum (
  'efectivo', 'ath', 'credito', 'ath_movil', 'cheque', 'giro'
);
create type donation_status as enum ('vigente', 'anulada');

create table donations (
  id uuid primary key default gen_random_uuid(),
  -- Generada por el formulario al abrirse: un doble clic o un reintento
  -- de red con la misma clave no crea otra donación. Dos aportaciones
  -- legítimas iguales (persona, fecha, monto) sí se permiten.
  idempotency_key uuid not null unique,
  person_id uuid references people (id) on delete restrict,
  is_anonymous boolean not null default false,
  donation_date date not null check (donation_date >= date '2000-01-01'),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000),
  donation_type donation_type not null,
  payment_method donation_payment_method not null,
  reference text check (reference is null or char_length(reference) between 1 and 80),
  status donation_status not null default 'vigente',
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  check ((is_anonymous and person_id is null) or (not is_anonymous and person_id is not null)),
  check ((status = 'anulada') = (voided_at is not null))
);

comment on table donations is
  'Pagos ya recibidos (no procesa tarjetas ni mueve dinero). Montos en '
  'centavos. Nunca se borra: ver donation_revisions. Solo apostol/finanzas.';
comment on column donations.reference is
  'Referencia opcional (núm. de cheque, confirmación ATH…). Nunca números '
  'completos de tarjeta ni credenciales bancarias; nunca la petición de oración.';

create index donations_date_idx on donations (donation_date);
create index donations_person_date_idx on donations (person_id, donation_date);
create index donations_status_date_idx on donations (status, donation_date);

create table donation_revisions (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references donations (id) on delete restrict,
  revision int not null,
  action text not null check (action in ('creada', 'corregida', 'anulada')),
  before jsonb,
  after jsonb not null,
  reason text,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (donation_id, revision)
);

create table donation_prayer_notes (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null unique references donations (id) on delete restrict,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  -- Autorización para compartir con intercesión, REGISTRADA POR EL
  -- OPERADOR (la persona se lo indicó); no es una firma digital del donante.
  share_authorized_at timestamptz,
  share_authorized_by uuid references auth.users (id) on delete set null,
  shared_prayer_request_id uuid references prayer_requests (id) on delete set null
);

comment on table donation_prayer_notes is
  'Petición de oración escrita en el sobre. Confidencial y separada de los '
  'datos financieros: sin políticas de lectura; solo por '
  'read_donation_prayer_note() (auditada). Ver 0035.';

create table donation_prayer_note_access_log (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references donation_prayer_notes (id) on delete cascade,
  accessed_by uuid references auth.users (id) on delete set null,
  action text not null,
  accessed_at timestamptz not null default now()
);

create table finance_settings (
  id boolean primary key default true check (id),
  -- Tomado del logo oficial. El resto queda vacío hasta que la iglesia
  -- lo provea: no se inventan direcciones, números ni firmantes.
  church_name text not null default 'Ciudad de Avivamiento',
  address text,
  phone text,
  email text,
  tax_id text,
  letter_recipient text not null default 'Secretario de Hacienda',
  letter_body text not null default
    'Por medio de la presente certificamos que, según nuestros registros, {donante} realizó aportaciones a {iglesia} durante el período {periodo}, por un total registrado de {total}.',
  letter_closing text not null default 'Atentamente,',
  signer_name text,
  signer_title text,
  template_status text not null default 'borrador' check (template_status in ('borrador', 'aprobada')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into finance_settings (id) values (true);

create table donation_letters (
  id uuid primary key,
  person_id uuid not null references people (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  version int not null,
  document_code text not null unique,
  total_cents bigint not null check (total_cents >= 0),
  donation_count int not null,
  snapshot jsonb not null,
  pdf bytea not null,
  pdf_sha256 text not null,
  status text not null default 'vigente'
    check (status in ('vigente', 'requiere_revision', 'reemplazada')),
  review_reason text,
  review_flagged_at timestamptz,
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users (id) on delete set null,
  check (period_end >= period_start),
  unique (person_id, period_start, period_end, version)
);

comment on table donation_letters is
  'Cartas emitidas: instantánea del contenido, total y PDF exacto. Una '
  'corrección posterior NO la modifica: la marca requiere_revision.';

create index donation_letters_person_idx on donation_letters (person_id, period_start);

create table finance_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on table finance_audit_log is
  'Auditoría financiera (cartas, exportaciones, configuración, lecturas '
  'y envíos de peticiones del sobre). Solo apostol la lee. Nunca contiene '
  'el texto de la petición.';

-- Historial inmutable (ni siquiera por funciones: solo se inserta).
create or replace function prevent_history_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El historial no se puede modificar.' using errcode = '42501';
end;
$$;

create trigger donation_revisions_immutable
  before update or delete on donation_revisions
  for each row execute function prevent_history_change();
create trigger finance_audit_log_immutable
  before update or delete on finance_audit_log
  for each row execute function prevent_history_change();
create trigger donation_prayer_note_access_log_immutable
  before update or delete on donation_prayer_note_access_log
  for each row execute function prevent_history_change();

-- Una donación no se borra por ninguna vía de la app.
create trigger donations_no_delete
  before delete on donations
  for each row execute function prevent_history_change();

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------

alter table donations enable row level security;
alter table donation_revisions enable row level security;
alter table donation_prayer_notes enable row level security;
alter table donation_prayer_note_access_log enable row level security;
alter table finance_settings enable row level security;
alter table donation_letters enable row level security;
alter table finance_audit_log enable row level security;

create policy donations_select_finance on donations
  for select using (has_finance_access());
create policy donation_revisions_select_finance on donation_revisions
  for select using (has_finance_access());
create policy finance_settings_select_finance on finance_settings
  for select using (has_finance_access());
create policy donation_letters_select_finance on donation_letters
  for select using (has_finance_access());
create policy finance_audit_log_select_apostol on finance_audit_log
  for select using (is_apostol());
create policy donation_prayer_note_access_log_select_apostol on donation_prayer_note_access_log
  for select using (is_apostol());
-- donation_prayer_notes: SIN políticas (nadie la lee directo).
-- Ninguna tabla tiene políticas de escritura: solo las funciones de abajo.

-- ---------------------------------------------------------------------
-- 5. Utilidades internas
-- ---------------------------------------------------------------------

create or replace function finance_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Puerto_Rico')::date;
$$;

create or replace function finance_require_access()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_finance_access() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
end;
$$;

create or replace function finance_log(p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into finance_audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'));
$$;

revoke all on function finance_log(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function finance_require_access() from public, anon;

create or replace function donation_validate(
  p_person_id uuid,
  p_is_anonymous boolean,
  p_date date,
  p_amount_cents bigint,
  p_reference text
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_is_anonymous is null or (p_is_anonymous and p_person_id is not null)
     or (not p_is_anonymous and p_person_id is null) then
    raise exception 'DATOS_INVALIDOS: Elige una persona o marca la donación como anónima.';
  end if;
  if p_person_id is not null and not exists (select 1 from people where id = p_person_id) then
    raise exception 'DATOS_INVALIDOS: No se encontró a la persona.';
  end if;
  if p_date is null or p_date < date '2000-01-01' or p_date > finance_today() then
    raise exception 'DATOS_INVALIDOS: La fecha no puede ser futura.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'DATOS_INVALIDOS: La cantidad debe ser mayor que $0.00 y hasta $1,000,000.00.';
  end if;
  if p_reference is not null and (
       char_length(p_reference) > 80
       or regexp_replace(p_reference, '[\s-]', '', 'g') ~ '\d{13,}'
     ) then
    raise exception 'DATOS_INVALIDOS: La referencia no puede contener números de tarjeta (máx. 80 caracteres).';
  end if;
end;
$$;

revoke all on function donation_validate(uuid, boolean, date, bigint, text) from public, anon, authenticated;

create or replace function donation_row_json(d donations)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'person_id', d.person_id, 'is_anonymous', d.is_anonymous,
    'donation_date', d.donation_date, 'amount_cents', d.amount_cents,
    'donation_type', d.donation_type, 'payment_method', d.payment_method,
    'reference', d.reference, 'status', d.status
  );
$$;

-- Una corrección, anulación o alta con fecha dentro de un período ya
-- certificado marca esas cartas para revisión (no las cambia).
create or replace function flag_letters_for_review(p_person_id uuid, p_date date, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  update donation_letters
    set status = 'requiere_revision', review_reason = p_reason, review_flagged_at = now()
    where status = 'vigente'
      and p_person_id is not null
      and person_id = p_person_id
      and p_date between period_start and period_end;
$$;

revoke all on function flag_letters_for_review(uuid, date, text) from public, anon, authenticated;

create or replace function share_note_with_intercession(p_note_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note donation_prayer_notes%rowtype;
  v_don donations%rowtype;
  v_prayer uuid;
begin
  select * into v_note from donation_prayer_notes where id = p_note_id for update;
  if v_note.shared_prayer_request_id is not null then
    return v_note.shared_prayer_request_id;
  end if;
  select * into v_don from donations where id = v_note.donation_id;

  -- Solo el texto y la identidad necesaria. submitted_by_user_id queda
  -- NULL a propósito: el operador financiero no gana acceso a la
  -- petición por la regla "el autor ve lo suyo" del módulo de oración.
  insert into prayer_requests (requester_person_id, submitted_by_user_id, is_anonymous,
                               is_confidential, category, content)
  values (v_don.person_id, null, v_don.is_anonymous, true, 'Sobre de ofrenda', v_note.content)
  returning id into v_prayer;

  update donation_prayer_notes
    set share_authorized_at = now(), share_authorized_by = auth.uid(),
        shared_prayer_request_id = v_prayer
    where id = p_note_id;

  insert into prayer_request_access_log (prayer_request_id, accessed_by, action)
  values (v_prayer, auth.uid(), 'created_from_envelope');
  perform finance_log('share_prayer_note', 'donation_prayer_notes', p_note_id,
                      jsonb_build_object('donation_id', v_note.donation_id));
  return v_prayer;
end;
$$;

revoke all on function share_note_with_intercession(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Registro, corrección y anulación
-- ---------------------------------------------------------------------

create or replace function create_donation(
  p_idempotency_key uuid,
  p_person_id uuid,
  p_is_anonymous boolean,
  p_donation_date date,
  p_amount_cents bigint,
  p_donation_type donation_type,
  p_payment_method donation_payment_method,
  p_reference text default null,
  p_prayer_text text default null,
  p_share_with_intercession boolean default false,
  p_share_authorized boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
  v_prayer text := nullif(trim(coalesce(p_prayer_text, '')), '');
  v_row donations%rowtype;
  v_note uuid;
begin
  perform finance_require_access();
  if p_idempotency_key is null or p_donation_type is null or p_payment_method is null then
    raise exception 'DATOS_INVALIDOS: Faltan datos requeridos.';
  end if;

  -- Reintento o doble clic: devuelve la misma donación sin crear otra.
  select * into v_row from donations where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_row.id, 'created', false);
  end if;

  perform donation_validate(p_person_id, p_is_anonymous, p_donation_date, p_amount_cents, v_ref);
  if v_prayer is not null and char_length(v_prayer) > 2000 then
    raise exception 'DATOS_INVALIDOS: La petición de oración es demasiado larga (máx. 2000 caracteres).';
  end if;
  if coalesce(p_share_with_intercession, false) and v_prayer is null then
    raise exception 'DATOS_INVALIDOS: No hay petición de oración para compartir.';
  end if;
  if coalesce(p_share_with_intercession, false) and not coalesce(p_share_authorized, false) then
    raise exception 'DATOS_INVALIDOS: Para compartir con intercesión, confirma que la persona lo autorizó.';
  end if;

  insert into donations (idempotency_key, person_id, is_anonymous, donation_date, amount_cents,
                         donation_type, payment_method, reference, created_by, updated_by)
  values (p_idempotency_key, p_person_id, p_is_anonymous, p_donation_date, p_amount_cents,
          p_donation_type, p_payment_method, v_ref, auth.uid(), auth.uid())
  on conflict (idempotency_key) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- Carrera con otro intento idéntico que ganó la inserción.
    select * into v_row from donations where idempotency_key = p_idempotency_key;
    return jsonb_build_object('id', v_row.id, 'created', false);
  end if;

  insert into donation_revisions (donation_id, revision, action, before, after, actor_user_id)
  values (v_row.id, 1, 'creada', null, donation_row_json(v_row), auth.uid());

  if v_prayer is not null then
    insert into donation_prayer_notes (donation_id, content, created_by)
    values (v_row.id, v_prayer, auth.uid())
    returning id into v_note;
    if coalesce(p_share_with_intercession, false) then
      perform share_note_with_intercession(v_note);
    end if;
  end if;

  perform flag_letters_for_review(v_row.person_id, v_row.donation_date,
    'Se registró una donación con fecha dentro de este período.');

  return jsonb_build_object('id', v_row.id, 'created', true);
end;
$$;

revoke all on function create_donation(uuid, uuid, boolean, date, bigint, donation_type, donation_payment_method, text, text, boolean, boolean) from public, anon;
grant execute on function create_donation(uuid, uuid, boolean, date, bigint, donation_type, donation_payment_method, text, text, boolean, boolean) to authenticated;

create or replace function correct_donation(
  p_donation_id uuid,
  p_expected_version int,
  p_person_id uuid,
  p_is_anonymous boolean,
  p_donation_date date,
  p_amount_cents bigint,
  p_donation_type donation_type,
  p_payment_method donation_payment_method,
  p_reference text,
  p_reason text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text := nullif(trim(coalesce(p_reference, '')), '');
  v_old donations%rowtype;
  v_new donations%rowtype;
begin
  perform finance_require_access();
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DATOS_INVALIDOS: Escribe el motivo de la corrección (mínimo 5 caracteres).';
  end if;

  select * into v_old from donations where id = p_donation_id for update;
  if not found then
    raise exception 'NO_ENCONTRADA: No se encontró la donación.';
  end if;
  if v_old.status = 'anulada' then
    raise exception 'ANULADA: Una donación anulada no se puede corregir.';
  end if;
  if v_old.version <> p_expected_version then
    raise exception 'VERSION: Otra persona modificó esta donación mientras la editabas. Recarga e intenta de nuevo.';
  end if;

  perform donation_validate(p_person_id, p_is_anonymous, p_donation_date, p_amount_cents, v_ref);

  if v_old.person_id is not distinct from p_person_id and v_old.is_anonymous = p_is_anonymous
     and v_old.donation_date = p_donation_date and v_old.amount_cents = p_amount_cents
     and v_old.donation_type = p_donation_type and v_old.payment_method = p_payment_method
     and v_old.reference is not distinct from v_ref then
    raise exception 'SIN_CAMBIOS: No cambiaste ningún dato.';
  end if;

  update donations set
    person_id = p_person_id, is_anonymous = p_is_anonymous, donation_date = p_donation_date,
    amount_cents = p_amount_cents, donation_type = p_donation_type,
    payment_method = p_payment_method, reference = v_ref,
    version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_donation_id
  returning * into v_new;

  insert into donation_revisions (donation_id, revision, action, before, after, reason, actor_user_id)
  values (p_donation_id, v_new.version, 'corregida', donation_row_json(v_old),
          donation_row_json(v_new), trim(p_reason), auth.uid());

  perform flag_letters_for_review(v_old.person_id, v_old.donation_date,
    'Se corrigió una donación incluida en este período.');
  perform flag_letters_for_review(v_new.person_id, v_new.donation_date,
    'Se corrigió una donación incluida en este período.');
  return v_new.version;
end;
$$;

revoke all on function correct_donation(uuid, int, uuid, boolean, date, bigint, donation_type, donation_payment_method, text, text) from public, anon;
grant execute on function correct_donation(uuid, int, uuid, boolean, date, bigint, donation_type, donation_payment_method, text, text) to authenticated;

create or replace function void_donation(p_donation_id uuid, p_expected_version int, p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old donations%rowtype;
  v_new donations%rowtype;
begin
  perform finance_require_access();
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DATOS_INVALIDOS: Escribe el motivo de la anulación (mínimo 5 caracteres).';
  end if;
  select * into v_old from donations where id = p_donation_id for update;
  if not found then
    raise exception 'NO_ENCONTRADA: No se encontró la donación.';
  end if;
  if v_old.status = 'anulada' then
    raise exception 'ANULADA: Esta donación ya estaba anulada.';
  end if;
  if v_old.version <> p_expected_version then
    raise exception 'VERSION: Otra persona modificó esta donación mientras la editabas. Recarga e intenta de nuevo.';
  end if;

  update donations set
    status = 'anulada', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason),
    version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_donation_id
  returning * into v_new;

  insert into donation_revisions (donation_id, revision, action, before, after, reason, actor_user_id)
  values (p_donation_id, v_new.version, 'anulada', donation_row_json(v_old),
          donation_row_json(v_new), trim(p_reason), auth.uid());

  perform flag_letters_for_review(v_old.person_id, v_old.donation_date,
    'Se anuló una donación incluida en este período.');
  return v_new.version;
end;
$$;

revoke all on function void_donation(uuid, int, text) from public, anon;
grant execute on function void_donation(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Petición del sobre: lectura auditada y envío a intercesión
-- ---------------------------------------------------------------------

create or replace function read_donation_prayer_note(p_donation_id uuid)
returns table (content text, created_at timestamptz, shared boolean,
               share_authorized_at timestamptz, share_authorized_by_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note donation_prayer_notes%rowtype;
begin
  perform finance_require_access();
  select * into v_note from donation_prayer_notes where donation_id = p_donation_id;
  if not found then
    return;
  end if;
  insert into donation_prayer_note_access_log (note_id, accessed_by, action)
  values (v_note.id, auth.uid(), 'view');
  return query select v_note.content, v_note.created_at, v_note.shared_prayer_request_id is not null,
    v_note.share_authorized_at,
    (select p.first_name || ' ' || p.last_name from profiles pr join people p on p.id = pr.person_id
     where pr.id = v_note.share_authorized_by);
end;
$$;

revoke all on function read_donation_prayer_note(uuid) from public, anon;
grant execute on function read_donation_prayer_note(uuid) to authenticated;

-- Solo dice si existe (para mostrar el botón "Ver petición"), sin texto.
create or replace function donation_has_prayer_note(p_donation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return exists (select 1 from donation_prayer_notes where donation_id = p_donation_id);
end;
$$;

revoke all on function donation_has_prayer_note(uuid) from public, anon;
grant execute on function donation_has_prayer_note(uuid) to authenticated;

create or replace function share_donation_prayer_note(p_donation_id uuid, p_authorized boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note uuid;
  v_already boolean;
begin
  perform finance_require_access();
  if not coalesce(p_authorized, false) then
    raise exception 'DATOS_INVALIDOS: Confirma que la persona autorizó compartir su petición.';
  end if;
  select id, shared_prayer_request_id is not null into v_note, v_already
    from donation_prayer_notes where donation_id = p_donation_id;
  if v_note is null then
    raise exception 'NO_ENCONTRADA: Esta donación no tiene petición de oración.';
  end if;
  perform share_note_with_intercession(v_note);
  return case when v_already then 'ya_compartida' else 'compartida' end;
end;
$$;

revoke all on function share_donation_prayer_note(uuid, boolean) from public, anon;
grant execute on function share_donation_prayer_note(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Consultas: búsqueda, listado, totales
-- ---------------------------------------------------------------------

create or replace function finance_search_people(p_query text)
returns table (person_id uuid, display_name text, hint text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')));
  v_terms text[];
begin
  perform finance_require_access();
  if length(v_q) < 2 then
    return;
  end if;
  v_terms := string_to_array(v_q, ' ');
  return query
    select p.id, p.first_name || ' ' || p.last_name,
      case
        when length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 4 then
          'Tel. termina en ' || right(regexp_replace(p.phone, '\D', '', 'g'), 4)
        when p.email is not null then left(p.email::text, 1) || '•••@' || split_part(p.email::text, '@', 2)
        else null
      end
    from people p
    where not exists (
      select 1 from unnest(v_terms) t
      where position(t in lower(p.first_name || ' ' || p.last_name || ' ' || coalesce(p.preferred_name, ''))) = 0
    )
    order by p.last_name, p.first_name, p.id
    limit 20;
end;
$$;

revoke all on function finance_search_people(text) from public, anon;
grant execute on function finance_search_people(text) to authenticated;

create or replace function finance_get_person(p_person_id uuid)
returns table (person_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query select p.id, p.first_name || ' ' || p.last_name from people p where p.id = p_person_id;
end;
$$;

revoke all on function finance_get_person(uuid) from public, anon;
grant execute on function finance_get_person(uuid) to authenticated;

create or replace function finance_list_donations(
  p_from date default null,
  p_to date default null,
  p_person_id uuid default null,
  p_type donation_type default null,
  p_method donation_payment_method default null,
  p_status donation_status default null,
  p_identity text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id uuid,
  donation_date date,
  person_id uuid,
  donor_name text,
  is_anonymous boolean,
  amount_cents bigint,
  donation_type donation_type,
  payment_method donation_payment_method,
  reference text,
  status donation_status,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query
    select d.id, d.donation_date, d.person_id,
      case when d.is_anonymous then null else p.first_name || ' ' || p.last_name end,
      d.is_anonymous, d.amount_cents, d.donation_type, d.payment_method, d.reference,
      d.status, d.created_at, count(*) over ()
    from donations d
    left join people p on p.id = d.person_id
    where (p_from is null or d.donation_date >= p_from)
      and (p_to is null or d.donation_date <= p_to)
      and (p_person_id is null or d.person_id = p_person_id)
      and (p_type is null or d.donation_type = p_type)
      and (p_method is null or d.payment_method = p_method)
      and (p_status is null or d.status = p_status)
      and (p_identity is null
           or (p_identity = 'identificadas' and not d.is_anonymous)
           or (p_identity = 'anonimas' and d.is_anonymous))
    order by d.donation_date desc, d.created_at desc, d.id
    limit least(greatest(coalesce(p_limit, 25), 1), 1000)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function finance_list_donations(date, date, uuid, donation_type, donation_payment_method, donation_status, text, int, int) from public, anon;
grant execute on function finance_list_donations(date, date, uuid, donation_type, donation_payment_method, donation_status, text, int, int) to authenticated;

-- Totales de TODOS los registros del filtro (no de la página), solo
-- donaciones vigentes. Sumas en bigint (centavos exactos).
create or replace function finance_donation_totals(
  p_from date default null,
  p_to date default null,
  p_person_id uuid default null,
  p_type donation_type default null,
  p_method donation_payment_method default null,
  p_identity text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform finance_require_access();
  with f as (
    select d.* from donations d
    where d.status = 'vigente'
      and (p_from is null or d.donation_date >= p_from)
      and (p_to is null or d.donation_date <= p_to)
      and (p_person_id is null or d.person_id = p_person_id)
      and (p_type is null or d.donation_type = p_type)
      and (p_method is null or d.payment_method = p_method)
      and (p_identity is null
           or (p_identity = 'identificadas' and not d.is_anonymous)
           or (p_identity = 'anonimas' and d.is_anonymous))
  )
  select jsonb_build_object(
    'total_cents', coalesce((select sum(amount_cents) from f), 0)::bigint,
    'count', (select count(*) from f),
    'identified_cents', coalesce((select sum(amount_cents) from f where not is_anonymous), 0)::bigint,
    'identified_count', (select count(*) from f where not is_anonymous),
    'anonymous_cents', coalesce((select sum(amount_cents) from f where is_anonymous), 0)::bigint,
    'anonymous_count', (select count(*) from f where is_anonymous),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object('key', donation_type, 'cents', s, 'count', c) order by donation_type)
                          from (select donation_type, sum(amount_cents)::bigint s, count(*) c from f group by 1) t), '[]'),
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('key', payment_method, 'cents', s, 'count', c) order by payment_method)
                          from (select payment_method, sum(amount_cents)::bigint s, count(*) c from f group by 1) t), '[]')
  ) into v;
  return v;
end;
$$;

revoke all on function finance_donation_totals(date, date, uuid, donation_type, donation_payment_method, text) from public, anon;
grant execute on function finance_donation_totals(date, date, uuid, donation_type, donation_payment_method, text) to authenticated;

create or replace function finance_donor_yearly(p_person_id uuid)
returns table (year int, total_cents bigint, donation_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query
    select extract(year from d.donation_date)::int, sum(d.amount_cents)::bigint, count(*)
    from donations d
    where d.person_id = p_person_id and d.status = 'vigente'
    group by 1 order by 1 desc;
end;
$$;

revoke all on function finance_donor_yearly(uuid) from public, anon;
grant execute on function finance_donor_yearly(uuid) to authenticated;

create or replace function finance_get_donation(p_donation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform finance_require_access();
  select jsonb_build_object(
    'donation', to_jsonb(d) - 'idempotency_key',
    'donor_name', case when d.is_anonymous then null else p.first_name || ' ' || p.last_name end,
    'created_by_name', (select cp.first_name || ' ' || cp.last_name from profiles cpr
                          join people cp on cp.id = cpr.person_id where cpr.id = d.created_by),
    'has_prayer_note', exists (select 1 from donation_prayer_notes n where n.donation_id = d.id),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', r.revision, 'action', r.action, 'before', r.before, 'after', r.after,
        'reason', r.reason, 'created_at', r.created_at,
        'actor_name', (select ap.first_name || ' ' || ap.last_name from profiles apr
                         join people ap on ap.id = apr.person_id where apr.id = r.actor_user_id))
        order by r.revision)
      from donation_revisions r where r.donation_id = d.id), '[]')
  ) into v
  from donations d left join people p on p.id = d.person_id
  where d.id = p_donation_id;
  return v;
end;
$$;

revoke all on function finance_get_donation(uuid) from public, anon;
grant execute on function finance_get_donation(uuid) to authenticated;

create or replace function finance_record_export(p_filters jsonb, p_rows int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  perform finance_log('export_donations', 'donations', null,
                      jsonb_build_object('filters', p_filters, 'rows', p_rows));
end;
$$;

revoke all on function finance_record_export(jsonb, int) from public, anon;
grant execute on function finance_record_export(jsonb, int) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Configuración de cartas
-- ---------------------------------------------------------------------

create or replace function finance_update_settings(
  p_church_name text,
  p_address text,
  p_phone text,
  p_email text,
  p_tax_id text,
  p_letter_recipient text,
  p_letter_body text,
  p_letter_closing text,
  p_signer_name text,
  p_signer_title text,
  p_template_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old finance_settings%rowtype;
begin
  perform finance_require_access();
  select * into v_old from finance_settings where id for update;
  if p_template_status not in ('borrador', 'aprobada') then
    raise exception 'DATOS_INVALIDOS: Estado de plantilla inválido.';
  end if;
  if p_template_status <> v_old.template_status and not is_apostol() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_church_name, ''))) = 0 or length(trim(coalesce(p_letter_recipient, ''))) = 0
     or length(trim(coalesce(p_letter_body, ''))) = 0 then
    raise exception 'DATOS_INVALIDOS: Nombre de la iglesia, destinatario y texto son requeridos.';
  end if;
  if length(p_letter_body) > 3000 then
    raise exception 'DATOS_INVALIDOS: El texto de la carta es demasiado largo.';
  end if;

  update finance_settings set
    church_name = trim(p_church_name),
    address = nullif(trim(coalesce(p_address, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    email = nullif(trim(coalesce(p_email, '')), ''),
    tax_id = nullif(trim(coalesce(p_tax_id, '')), ''),
    letter_recipient = trim(p_letter_recipient),
    letter_body = trim(p_letter_body),
    letter_closing = coalesce(nullif(trim(coalesce(p_letter_closing, '')), ''), 'Atentamente,'),
    signer_name = nullif(trim(coalesce(p_signer_name, '')), ''),
    signer_title = nullif(trim(coalesce(p_signer_title, '')), ''),
    template_status = p_template_status,
    updated_at = now(), updated_by = auth.uid()
  where id;

  perform finance_log('update_finance_settings', 'finance_settings', null,
                      jsonb_build_object('before', to_jsonb(v_old) - 'updated_by'));
end;
$$;

revoke all on function finance_update_settings(text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function finance_update_settings(text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Cartas
-- ---------------------------------------------------------------------

-- Datos para previsualizar/emitir: solo donaciones VIGENTES, IDENTIFICADAS
-- de esa persona y dentro del período (fechas locales, inclusivas).
create or replace function finance_letter_data(p_person_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  perform finance_require_access();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 * 5 then
    raise exception 'DATOS_INVALIDOS: Período inválido.';
  end if;
  if not exists (select 1 from people where id = p_person_id) then
    raise exception 'DATOS_INVALIDOS: No se encontró a la persona.';
  end if;

  select jsonb_build_object(
    'person_name', (select first_name || ' ' || last_name from people where id = p_person_id),
    'total_cents', coalesce(sum(d.amount_cents), 0)::bigint,
    'donation_count', count(d.id),
    'next_version', (select coalesce(max(version), 0) + 1 from donation_letters l
                      where l.person_id = p_person_id and l.period_start = p_from and l.period_end = p_to),
    'donations', coalesce(jsonb_agg(jsonb_build_object(
        'date', d.donation_date, 'type', d.donation_type, 'amount_cents', d.amount_cents)
        order by d.donation_date, d.created_at) filter (where d.id is not null), '[]'),
    'settings', (select to_jsonb(s) - 'updated_by' - 'updated_at' - 'id' from finance_settings s where s.id)
  ) into v
  from donations d
  where d.person_id = p_person_id and d.status = 'vigente' and not d.is_anonymous
    and d.donation_date between p_from and p_to;
  return v;
end;
$$;

revoke all on function finance_letter_data(uuid, date, date) from public, anon;
grant execute on function finance_letter_data(uuid, date, date) to authenticated;

create or replace function issue_donation_letter(
  p_letter_id uuid,
  p_person_id uuid,
  p_from date,
  p_to date,
  p_expected_total_cents bigint,
  p_expected_count int,
  p_expected_version int,
  p_document_code text,
  p_snapshot jsonb,
  p_pdf_base64 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
  v_pdf bytea;
begin
  perform finance_require_access();

  -- Doble clic / reintento: la misma carta.
  if exists (select 1 from donation_letters where id = p_letter_id) then
    return jsonb_build_object('id', p_letter_id, 'created', false);
  end if;

  perform pg_advisory_xact_lock(hashtext('donation_letter:' || p_person_id::text || p_from::text || p_to::text));
  v_data := finance_letter_data(p_person_id, p_from, p_to);

  -- El total SIEMPRE lo calcula la base; si cambió desde la vista previa,
  -- no se emite (evita certificar un total distinto al revisado).
  if (v_data ->> 'total_cents')::bigint <> p_expected_total_cents
     or (v_data ->> 'donation_count')::int <> p_expected_count
     or (v_data ->> 'next_version')::int <> p_expected_version then
    raise exception 'DATOS_CAMBIARON: Las donaciones del período cambiaron desde la vista previa. Revisa de nuevo antes de emitir.';
  end if;
  if (p_snapshot ->> 'total_cents')::bigint is distinct from p_expected_total_cents then
    raise exception 'DATOS_INVALIDOS: La instantánea no coincide con el total.';
  end if;

  v_pdf := decode(p_pdf_base64, 'base64');
  if v_pdf is null or length(v_pdf) < 100 or substring(v_pdf from 1 for 4) <> '\x25504446'::bytea then
    raise exception 'DATOS_INVALIDOS: PDF inválido.';
  end if;

  update donation_letters set status = 'reemplazada'
    where person_id = p_person_id and period_start = p_from and period_end = p_to
      and status <> 'reemplazada';

  insert into donation_letters (id, person_id, period_start, period_end, version, document_code,
                                total_cents, donation_count, snapshot, pdf, pdf_sha256, issued_by)
  values (p_letter_id, p_person_id, p_from, p_to, p_expected_version, p_document_code,
          p_expected_total_cents, p_expected_count, p_snapshot, v_pdf,
          encode(extensions.digest(v_pdf, 'sha256'), 'hex'), auth.uid());

  perform finance_log('issue_donation_letter', 'donation_letters', p_letter_id,
                      jsonb_build_object('document_code', p_document_code, 'version', p_expected_version));
  return jsonb_build_object('id', p_letter_id, 'created', true);
end;
$$;

revoke all on function issue_donation_letter(uuid, uuid, date, date, bigint, int, int, text, jsonb, text) from public, anon;
grant execute on function issue_donation_letter(uuid, uuid, date, date, bigint, int, int, text, jsonb, text) to authenticated;

create or replace function list_donation_letters(p_person_id uuid default null)
returns table (
  id uuid, person_id uuid, person_name text, period_start date, period_end date, version int,
  document_code text, total_cents bigint, donation_count int, status text, review_reason text,
  issued_at timestamptz, issued_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query
    select l.id, l.person_id, p.first_name || ' ' || p.last_name, l.period_start, l.period_end,
      l.version, l.document_code, l.total_cents, l.donation_count, l.status, l.review_reason,
      l.issued_at,
      (select ip.first_name || ' ' || ip.last_name from profiles ipr join people ip on ip.id = ipr.person_id
       where ipr.id = l.issued_by)
    from donation_letters l join people p on p.id = l.person_id
    where p_person_id is null or l.person_id = p_person_id
    order by l.issued_at desc
    limit 200;
end;
$$;

revoke all on function list_donation_letters(uuid) from public, anon;
grant execute on function list_donation_letters(uuid) to authenticated;

create or replace function get_donation_letter_pdf(p_letter_id uuid)
returns table (document_code text, pdf_base64 text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  if not exists (select 1 from donation_letters where id = p_letter_id) then
    return;
  end if;
  perform finance_log('download_donation_letter', 'donation_letters', p_letter_id, '{}');
  -- encode() parte el base64 en líneas de 76: se quitan para devolverlo exacto.
  return query select l.document_code, translate(encode(l.pdf, 'base64'), E'\n', '')
    from donation_letters l where l.id = p_letter_id;
end;
$$;

revoke all on function get_donation_letter_pdf(uuid) from public, anon;
grant execute on function get_donation_letter_pdf(uuid) to authenticated;
