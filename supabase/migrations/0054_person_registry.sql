-- Registro central de personas (decisión 2026-10-18, docs/decisions.md).
--
-- `people` ya es la identidad única (uuid). Esta migración agrega lo que
-- faltaba para que TODOS los módulos lleguen a la misma persona:
--
-- 1. Claves normalizadas (nombre, correo, teléfono) como columnas
--    generadas: se comparan formatos equivalentes sin tocar los valores
--    originales que se muestran.
-- 2. person_match_candidates(): coincidencias "confiable" / "posible" con
--    los motivos. Nunca une nada por sí sola.
-- 3. Alta común con revisión de coincidencias e idempotencia
--    (person_create_requests + candados por clave): un doble envío o dos
--    altas simultáneas no crean dos personas.
-- 4. Integrantes por ministerio (departamento): alta individual e
--    importación CSV en staging, sin crear cuentas.
-- 5. Unificación revisada de duplicados (person_merge), transaccional, con
--    rastro (person_merges) y sin unir dos cuentas de acceso.
-- 6. Vinculación verificada de una cuenta con su registro anterior: código
--    al correo que la iglesia YA tenía, o revisión de un administrador.
--
-- Los datos existentes no se unen: las columnas generadas se calculan
-- solas y los posibles duplicados quedan para revisión humana.

alter type person_source add value if not exists 'ministerio';
alter type person_source add value if not exists 'visita';

-- ---------------------------------------------------------------------
-- 1. Normalización
-- ---------------------------------------------------------------------

create or replace function person_name_key(p_first text, p_last text)
returns text
language sql
immutable
as $$
  select finance_name_key(coalesce(p_first, '') || ' ' || coalesce(p_last, ''));
$$;

create or replace function person_email_key(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p, ''))), '');
$$;

-- Solo dígitos; los números de PR/EE. UU. con 1 al frente se comparan sin
-- él ("+1 (787) 555-0101" = "787-555-0101"). Menos de 7 dígitos no cuenta.
create or replace function person_phone_key(p text)
returns text
language sql
immutable
as $$
  select case
           when length(d) = 11 and left(d, 1) = '1' then right(d, 10)
           when length(d) >= 7 then d
         end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s;
$$;

alter table people
  add column name_key text generated always as (person_name_key(first_name, last_name)) stored,
  add column email_key text generated always as (person_email_key(email::text)) stored,
  add column phone_key text generated always as (person_phone_key(phone)) stored;

create index people_name_key_idx on people (name_key);
create index people_email_key_idx on people (email_key) where email_key is not null;
create index people_phone_key_idx on people (phone_key) where phone_key is not null;

-- Enmascarado para mostrar coincidencias sin exponer el contacto.
create or replace function mask_email(p text)
returns text
language sql
immutable
as $$
  select case when p is null or position('@' in p) = 0 then null
              else left(p, 1) || '•••@' || split_part(p, '@', 2) end;
$$;

create or replace function mask_phone(p text)
returns text
language sql
immutable
as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 4
              then '•••' || right(regexp_replace(p, '\D', '', 'g'), 4) end;
$$;

-- ---------------------------------------------------------------------
-- 2. Coincidencias
-- ---------------------------------------------------------------------
-- confiable: el nombre concuerda (igual o contenido) Y además el correo,
--            el teléfono o la fecha de nacimiento, sin fecha distinta.
-- posible:   solo el nombre, o solo un contacto (puede ser compartido).
-- Mismo nombre con fecha de nacimiento distinta = otra persona: no sale.
-- Mismo correo/teléfono con otro nombre sale como posible ("Nombre
-- distinto"): en una familia se comparte el correo.
-- La edad (si se da) solo suma como indicio.

create or replace function person_match_candidates(
  p_first text,
  p_last text,
  p_email text,
  p_phone text,
  p_birth date,
  p_age int default null,
  p_include_finance_only boolean default false,
  p_exclude uuid default null,
  p_limit int default 8
)
returns table (person_id uuid, level text, score int, reasons text[])
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select person_name_key(p_first, p_last) as nk,
           coalesce(string_to_array(nullif(person_name_key(p_first, p_last), ''), ' '), '{}') as nt,
           person_email_key(p_email) as ek,
           person_phone_key(p_phone) as pk,
           p_birth as bd
  ),
  pool as (
    select p.id, p.name_key, p.birth_date,
      (q.nk <> '' and p.name_key = q.nk) as name_exact,
      (q.nk <> '' and p.name_key <> q.nk and (
         (cardinality(q.nt) >= 2 and q.nt <@ string_to_array(p.name_key, ' '))
         or (cardinality(string_to_array(p.name_key, ' ')) >= 2
             and string_to_array(p.name_key, ' ') <@ q.nt))) as name_similar,
      (q.ek is not null and p.email_key = q.ek) as email_eq,
      (q.pk is not null and p.phone_key = q.pk) as phone_eq,
      (q.bd is not null and p.birth_date = q.bd) as birth_eq,
      (q.bd is not null and p.birth_date is not null and p.birth_date <> q.bd) as birth_conflict,
      (p_age is not null and p.birth_date is not null
        and abs(extract(year from age(p.birth_date))::int - p_age) <= 1) as age_hint
    from people p, q
    where (p_include_finance_only or not p.finance_only)
      and p.anonymized_at is null
      and (p_exclude is null or p.id <> p_exclude)
      and (
        (q.ek is not null and p.email_key = q.ek)
        or (q.pk is not null and p.phone_key = q.pk)
        or (q.nk <> '' and p.name_key = q.nk)
        or (cardinality(q.nt) >= 2 and q.nt <@ string_to_array(p.name_key, ' '))
        or (cardinality(string_to_array(p.name_key, ' ')) >= 2
            and string_to_array(p.name_key, ' ') <@ q.nt)
      )
  ),
  scored as (
    select pool.*,
      (name_exact or name_similar) as name_ok,
      (case when email_eq then 40 else 0 end + case when phone_eq then 30 else 0 end
       + case when birth_eq then 30 else 0 end + case when name_exact then 30 else 0 end
       + case when name_similar then 15 else 0 end + case when age_hint then 5 else 0 end
       - case when birth_conflict then 40 else 0 end) as score
    from pool
  )
  select s.id,
    case when s.name_ok and (s.email_eq or s.phone_eq or s.birth_eq) and not s.birth_conflict
         then 'confiable' else 'posible' end,
    s.score,
    array_remove(array[
      case when s.name_exact then 'Mismo nombre' end,
      case when s.name_similar then 'Nombre parecido' end,
      case when not s.name_ok then 'Nombre distinto' end,
      case when s.email_eq then 'Mismo correo' end,
      case when s.phone_eq then 'Mismo teléfono' end,
      case when s.birth_eq then 'Misma fecha de nacimiento' end,
      case when s.age_hint and not s.birth_eq then 'Edad aproximada concuerda' end,
      case when s.birth_conflict then 'Fecha de nacimiento distinta' end
    ], null)
  from scored s
  where not (s.birth_conflict and not s.email_eq and not s.phone_eq)
  order by 2, 3 desc, s.name_key, s.id
  limit greatest(1, least(coalesce(p_limit, 8), 25));
$$;

comment on function person_match_candidates is
  'Coincidencias por nombre, correo, teléfono y fecha de nacimiento '
  'normalizados. Solo sugiere: nunca une ni crea. Uso interno (los '
  'módulos llaman a person_matches con su propio permiso). Ver 0054.';

revoke all on function person_match_candidates(text, text, text, text, date, int, boolean, uuid, int)
  from public, anon, authenticated;

-- Quién gestiona integrantes de un ministerio (espeja la RLS de 0028).
create or replace function can_manage_ministry_members(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['administrador', 'coordinador_ministerio']::app_role[])
      or is_ministry_leader(p_ministry_id);
$$;

revoke all on function can_manage_ministry_members(uuid) from public, anon;
grant execute on function can_manage_ministry_members(uuid) to authenticated;

-- Roles que dan de alta personas desde el directorio o Visitantes.
create or replace function can_register_people()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array[
    'administrador', 'pastor', 'coordinador_ministerio', 'seguimiento'
  ]::app_role[]);
$$;

revoke all on function can_register_people() from public, anon;
grant execute on function can_register_people() to authenticated;

-- Coincidencias para quien registra, con el permiso del módulo:
--   'directorio' (directorio y Visitantes), 'ministerio' (con p_ministry_id),
--   'finanzas' (incluye donantes solo de Finanzas).
-- Devuelve lo mínimo para decidir: nombre, motivos y contacto enmascarado.
-- Nunca historial, ministerios ajenos, donaciones ni notas.
create or replace function person_matches(
  p_context text,
  p_ministry_id uuid,
  p_first text,
  p_last text,
  p_email text default null,
  p_phone text default null,
  p_birth date default null,
  p_age int default null
)
returns table (
  person_id uuid,
  display_name text,
  level text,
  reasons text[],
  email_hint text,
  phone_hint text,
  has_account boolean,
  in_ministry boolean,
  finance_only boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_context = 'directorio' then
    if not can_register_people() then
      raise exception 'No autorizado.' using errcode = '42501';
    end if;
  elsif p_context = 'ministerio' then
    if p_ministry_id is null or not can_manage_ministry_members(p_ministry_id) then
      raise exception 'No autorizado.' using errcode = '42501';
    end if;
  elsif p_context = 'finanzas' then
    perform finance_require_access();
  else
    raise exception 'Contexto inválido.' using errcode = '22023';
  end if;

  -- Sin datos suficientes no se busca (no es un listado del directorio).
  if char_length(person_name_key(p_first, p_last)) < 3
     and person_email_key(p_email) is null and person_phone_key(p_phone) is null then
    return;
  end if;

  return query
    select c.person_id,
      btrim(p.first_name || ' ' || p.last_name),
      c.level,
      c.reasons,
      mask_email(p.email::text),
      mask_phone(p.phone),
      exists (select 1 from profiles pr where pr.person_id = p.id),
      (p_ministry_id is not null and exists (
        select 1 from ministry_memberships mm
         where mm.ministry_id = p_ministry_id and mm.person_id = p.id and mm.left_at is null)),
      p.finance_only
    from person_match_candidates(p_first, p_last, p_email, p_phone, p_birth, p_age,
                                 p_context = 'finanzas') c
    join people p on p.id = c.person_id;
end;
$$;

revoke all on function person_matches(text, uuid, text, text, text, text, date, int) from public, anon;
grant execute on function person_matches(text, uuid, text, text, text, text, date, int) to authenticated;

-- Estado de acceso derivado de la relación real (profiles), solo para las
-- personas que quien pregunta ya puede ver.
create or replace function people_account_status(p_ids uuid[])
returns table (person_id uuid, has_account boolean, invitation_pending boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
    exists (select 1 from profiles pr where pr.person_id = p.id),
    exists (select 1 from portal_invitations i
             where i.person_id = p.id and i.used_at is null and i.revoked_at is null
               and i.expires_at > now())
  from people p
  where p.id = any (coalesce(p_ids, '{}'))
    and (
      has_directory_access()
      or is_in_my_care(p.id)
      or exists (select 1 from ministry_memberships mm
                  where mm.person_id = p.id and is_ministry_leader(mm.ministry_id))
    );
$$;

revoke all on function people_account_status(uuid[]) from public, anon;
grant execute on function people_account_status(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Alta común (idempotente y con revisión de coincidencias)
-- ---------------------------------------------------------------------

create table person_create_requests (
  request_key uuid primary key,
  person_id uuid not null references people (id) on delete cascade,
  context text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table person_create_requests is
  'Clave de cada alta de persona (una por formulario/fila). Un doble envío '
  'devuelve la misma persona en vez de crear otra. Solo por funciones.';

alter table person_create_requests enable row level security;

-- Candado por clave normalizada: dos altas simultáneas con el mismo
-- nombre, correo o teléfono se atienden una tras otra, y la segunda ve a
-- la primera como coincidencia.
create or replace function person_lock_keys(p_first text, p_last text, p_email text, p_phone text)
returns void
language plpgsql
as $$
declare
  k bigint;
begin
  for k in
    select distinct hashtextextended(v, 54) from unnest(array[
      'n:' || nullif(person_name_key(p_first, p_last), ''),
      'e:' || person_email_key(p_email),
      'p:' || person_phone_key(p_phone)
    ]) v where v is not null order by 1
  loop
    perform pg_advisory_xact_lock(k);
  end loop;
end;
$$;

revoke all on function person_lock_keys(text, text, text, text) from public, anon, authenticated;

-- Núcleo interno. p_acknowledged = coincidencias que la persona que
-- registra ya vio y descartó. Si aparece alguna otra (por ejemplo, alguien
-- la registró hace un segundo), no crea y devuelve COINCIDENCIAS.
create or replace function person_create_checked(
  p_data jsonb,
  p_acknowledged uuid[],
  p_request_key uuid,
  p_context text,
  p_source person_source,
  p_membership membership_status,
  p_finance_only boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := btrim(regexp_replace(coalesce(p_data ->> 'first_name', ''), '\s+', ' ', 'g'));
  v_last text := btrim(regexp_replace(coalesce(p_data ->> 'last_name', ''), '\s+', ' ', 'g'));
  v_email text := nullif(btrim(coalesce(p_data ->> 'email', '')), '');
  v_phone text := nullif(btrim(coalesce(p_data ->> 'phone', '')), '');
  v_birth date;
  v_id uuid;
  v_new uuid[];
begin
  if p_request_key is null then
    raise exception 'DATOS_INVALIDOS: Falta la clave del envío.';
  end if;
  if v_first = '' or char_length(v_first) > 100 or char_length(v_last) > 100 then
    raise exception 'DATOS_INVALIDOS: Escribe el nombre (máx. 100 caracteres).';
  end if;
  if v_email is not null and (char_length(v_email) > 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'DATOS_INVALIDOS: El correo no es válido.';
  end if;
  if v_phone is not null and char_length(v_phone) > 30 then
    raise exception 'DATOS_INVALIDOS: El teléfono es demasiado largo.';
  end if;
  begin
    v_birth := nullif(p_data ->> 'birth_date', '')::date;
  exception when others then
    raise exception 'DATOS_INVALIDOS: La fecha de nacimiento no es válida.';
  end;
  if v_birth is not null and (v_birth > current_date or v_birth < date '1900-01-01') then
    raise exception 'DATOS_INVALIDOS: La fecha de nacimiento no es válida.';
  end if;

  perform person_lock_keys(v_first, v_last, v_email, v_phone);

  -- Envío repetido: misma persona.
  select person_id into v_id from person_create_requests where request_key = p_request_key;
  if v_id is not null then
    return v_id;
  end if;

  select array_agg(c.person_id) into v_new
    from person_match_candidates(v_first, v_last, v_email, v_phone, v_birth, null,
                                 p_finance_only) c
   where not (c.person_id = any (coalesce(p_acknowledged, '{}')));
  if v_new is not null then
    raise exception 'COINCIDENCIAS: Hay registros que podrían ser esta persona. Revísalos antes de crear uno nuevo.';
  end if;

  insert into people (
    first_name, last_name, preferred_name, birth_date, gender, email, phone,
    address_line, address_line2, city, postal_code, country, marital_status,
    membership_status, joined_at, notes, source, finance_only, created_by, updated_by
  )
  values (
    v_first, v_last,
    nullif(btrim(coalesce(p_data ->> 'preferred_name', '')), ''),
    v_birth,
    nullif(p_data ->> 'gender', '')::gender_type,
    v_email, v_phone,
    nullif(btrim(coalesce(p_data ->> 'address_line', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'address_line2', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'city', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'postal_code', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'country', '')), ''),
    nullif(btrim(coalesce(p_data ->> 'marital_status', '')), ''),
    coalesce(nullif(p_data ->> 'membership_status', '')::membership_status, p_membership),
    nullif(p_data ->> 'joined_at', '')::date,
    nullif(btrim(coalesce(p_data ->> 'notes', '')), ''),
    p_source, coalesce(p_finance_only, false), auth.uid(), auth.uid()
  )
  returning id into v_id;

  insert into person_create_requests (request_key, person_id, context, created_by)
  values (p_request_key, v_id, p_context, auth.uid());

  return v_id;
end;
$$;

revoke all on function person_create_checked(jsonb, uuid[], uuid, text, person_source, membership_status, boolean)
  from public, anon, authenticated;

-- Directorio y Visitantes (p_context 'directorio' o 'visita').
create or replace function register_person(
  p_context text,
  p_data jsonb,
  p_acknowledged uuid[],
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_context = 'directorio' then
    if not can_register_people() then
      raise exception 'No autorizado.' using errcode = '42501';
    end if;
    return person_create_checked(p_data, p_acknowledged, p_request_key, 'directorio',
                                 'manual', 'visitante');
  elsif p_context = 'visita' then
    if not has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[]) then
      raise exception 'No autorizado.' using errcode = '42501';
    end if;
    return person_create_checked(p_data - 'membership_status', p_acknowledged, p_request_key,
                                 'visita', 'visita', 'visitante');
  end if;
  raise exception 'Contexto inválido.' using errcode = '22023';
end;
$$;

revoke all on function register_person(text, jsonb, uuid[], uuid) from public, anon;
grant execute on function register_person(text, jsonb, uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Integrantes por ministerio
-- ---------------------------------------------------------------------

-- Agrega una persona existente (p_person_id) o crea una nueva con el flujo
-- común y la asigna. No crea cuenta ni da permisos: pertenecer a un
-- ministerio no da acceso de líder (eso es role_in_ministry, que solo
-- gestiona quien ya lidera) ni financiero.
create or replace function ministry_add_person(
  p_ministry_id uuid,
  p_person_id uuid,
  p_data jsonb,
  p_acknowledged uuid[],
  p_request_key uuid,
  p_role ministry_member_role default 'miembro',
  p_joined_at date default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person uuid := p_person_id;
  v_created boolean := false;
  v_inserted int;
begin
  if p_ministry_id is null or not can_manage_ministry_members(p_ministry_id) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if not exists (select 1 from ministries where id = p_ministry_id) then
    raise exception 'DATOS_INVALIDOS: El ministerio no existe.';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'DATOS_INVALIDOS: La nota es demasiado larga.';
  end if;

  if v_person is null then
    v_created := not exists (select 1 from person_create_requests where request_key = p_request_key);
    v_person := person_create_checked(p_data, p_acknowledged, p_request_key, 'ministerio',
                                      'ministerio', 'asistente_habitual');
  elsif not exists (select 1 from people where id = v_person and not finance_only
                                          and anonymized_at is null) then
    raise exception 'DATOS_INVALIDOS: Esa persona no está disponible.';
  end if;

  -- created_by = auth.uid(): la misma regla de la RLS (0029 sigue
  -- protegiendo líder/colíder en el ministerio de intercesión).
  insert into ministry_memberships (ministry_id, person_id, role_in_ministry, joined_at, notes, created_by)
  values (p_ministry_id, v_person, coalesce(p_role, 'miembro'),
          coalesce(p_joined_at, current_date), nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  on conflict (ministry_id, person_id) where left_at is null do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'person_id', v_person,
    'person_created', v_created,
    'membership', case when v_inserted = 1 then 'agregada' else 'ya_integrante' end
  );
end;
$$;

revoke all on function ministry_add_person(uuid, uuid, jsonb, uuid[], uuid, ministry_member_role, date, text)
  from public, anon;
grant execute on function ministry_add_person(uuid, uuid, jsonb, uuid[], uuid, ministry_member_role, date, text)
  to authenticated;

-- Importación de una lista (CSV) en staging: vista previa por fila,
-- decisión humana en lo ambiguo, aplicar por separado.
create table ministry_import_batches (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries (id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 200),
  row_count int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_applied_at timestamptz
);

create index ministry_import_batches_ministry_idx on ministry_import_batches (ministry_id, created_at desc);

create table ministry_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references ministry_import_batches (id) on delete cascade,
  row_number int not null,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  phone text,
  birth_date date,
  errors text[] not null default '{}',
  match_level text not null default 'ninguna'
    check (match_level in ('confiable', 'posible', 'ninguna')),
  -- [{id, name, level, reasons, email_hint, phone_hint, has_account, in_ministry}]
  candidates jsonb not null default '[]',
  decision text not null default 'pendiente'
    check (decision in ('pendiente', 'usar_existente', 'crear', 'omitir')),
  person_id uuid references people (id) on delete set null,
  result text check (result in ('agregada', 'ya_integrante', 'creada', 'omitida')),
  result_person_id uuid references people (id) on delete set null,
  processed_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  unique (batch_id, row_number),
  check (decision <> 'usar_existente' or person_id is not null)
);

alter table ministry_import_batches enable row level security;
alter table ministry_import_rows enable row level security;

create policy ministry_import_batches_select on ministry_import_batches
  for select using (can_manage_ministry_members(ministry_id));

create policy ministry_import_rows_select on ministry_import_rows
  for select using (exists (
    select 1 from ministry_import_batches b
     where b.id = ministry_import_rows.batch_id and can_manage_ministry_members(b.ministry_id)));

-- Escritura solo por funciones.

create or replace function ministry_import_match_row(p_ministry_id uuid, r ministry_import_rows)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.person_id, 'name', m.display_name, 'level', m.level, 'reasons', m.reasons,
    'email_hint', m.email_hint, 'phone_hint', m.phone_hint,
    'has_account', m.has_account, 'in_ministry', m.in_ministry)), '[]'::jsonb)
  from person_matches('ministerio', p_ministry_id, r.first_name, r.last_name, r.email,
                      r.phone, r.birth_date) m;
$$;

revoke all on function ministry_import_match_row(uuid, ministry_import_rows) from public, anon, authenticated;

create or replace function ministry_import_create_batch(
  p_ministry_id uuid,
  p_file_name text,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
  v_item jsonb;
  v_row ministry_import_rows;
  v_errors text[];
  v_birth date;
  v_seen jsonb := '{}';
  v_key text;
  v_cands jsonb;
  v_conf jsonb;
  v_n int := 0;
begin
  if p_ministry_id is null or not can_manage_ministry_members(p_ministry_id) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'DATOS_INVALIDOS: El archivo no tiene filas.';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'DATOS_INVALIDOS: Máximo 1,000 filas por archivo.';
  end if;

  insert into ministry_import_batches (ministry_id, file_name, row_count, created_by)
  values (p_ministry_id, left(coalesce(nullif(btrim(p_file_name), ''), 'lista.csv'), 200),
          jsonb_array_length(p_rows), auth.uid())
  returning id into v_batch;

  for v_item in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_errors := coalesce(array(select jsonb_array_elements_text(v_item -> 'errors')), '{}');
    begin
      v_birth := nullif(v_item ->> 'birth_date', '')::date;
    exception when others then
      v_birth := null;
      v_errors := v_errors || 'Fecha de nacimiento inválida.'::text;
    end;

    v_row := null;
    v_row.id := gen_random_uuid();
    v_row.batch_id := v_batch;
    v_row.row_number := coalesce((v_item ->> 'row_number')::int, v_n);
    v_row.first_name := left(btrim(coalesce(v_item ->> 'first_name', '')), 100);
    v_row.last_name := left(btrim(coalesce(v_item ->> 'last_name', '')), 100);
    v_row.email := nullif(btrim(coalesce(v_item ->> 'email', '')), '');
    v_row.phone := left(nullif(btrim(coalesce(v_item ->> 'phone', '')), ''), 30);
    v_row.birth_date := v_birth;

    if v_row.first_name = '' and not ('Falta el nombre.' = any (v_errors)) then
      v_errors := v_errors || 'Falta el nombre.'::text;
    end if;
    if v_row.email is not null and v_row.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
       and not ('Correo inválido.' = any (v_errors)) then
      v_errors := v_errors || 'Correo inválido.'::text;
    end if;

    -- La misma persona repetida dentro del archivo (mismo nombre y mismo
    -- correo, o mismo nombre sin correo) solo se procesa una vez.
    v_key := person_name_key(v_row.first_name, v_row.last_name) || '|'
             || coalesce(person_email_key(v_row.email), '');
    if cardinality(v_errors) = 0 and v_seen ? v_key then
      v_errors := v_errors || ('Repetida en el archivo (fila ' || (v_seen ->> v_key) || ').')::text;
    elsif cardinality(v_errors) = 0 then
      v_seen := v_seen || jsonb_build_object(v_key, v_row.row_number);
    end if;

    v_row.errors := v_errors;
    v_cands := '[]';
    if cardinality(v_errors) = 0 then
      v_cands := ministry_import_match_row(p_ministry_id, v_row);
    end if;
    v_row.candidates := v_cands;
    v_conf := (select jsonb_agg(c) from jsonb_array_elements(v_cands) c where c ->> 'level' = 'confiable');

    if cardinality(v_errors) > 0 then
      v_row.match_level := 'ninguna';
      v_row.decision := 'omitir';
    elsif jsonb_array_length(v_cands) = 0 then
      v_row.match_level := 'ninguna';
      v_row.decision := 'crear';
    elsif v_conf is not null and jsonb_array_length(v_conf) = 1 then
      -- Una sola coincidencia confiable: se sugiere reutilizarla (se ve y
      -- se puede cambiar antes de aplicar).
      v_row.match_level := 'confiable';
      v_row.decision := 'usar_existente';
      v_row.person_id := (v_conf -> 0 ->> 'id')::uuid;
    else
      v_row.match_level := case when v_conf is not null then 'confiable' else 'posible' end;
      v_row.decision := 'pendiente';
    end if;

    insert into ministry_import_rows select v_row.*;
  end loop;

  return v_batch;
end;
$$;

revoke all on function ministry_import_create_batch(uuid, text, jsonb) from public, anon;
grant execute on function ministry_import_create_batch(uuid, text, jsonb) to authenticated;

create or replace function ministry_import_decide(p_row_id uuid, p_decision text, p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row ministry_import_rows;
  v_ministry uuid;
begin
  select r.* into v_row from ministry_import_rows r where r.id = p_row_id for update;
  if not found then
    raise exception 'DATOS_INVALIDOS: Fila no encontrada.';
  end if;
  select ministry_id into v_ministry from ministry_import_batches where id = v_row.batch_id;
  if not can_manage_ministry_members(v_ministry) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if v_row.processed_at is not null then
    raise exception 'DATOS_INVALIDOS: Esta fila ya se aplicó.';
  end if;
  if cardinality(v_row.errors) > 0 and p_decision <> 'omitir' then
    raise exception 'DATOS_INVALIDOS: La fila tiene errores; corrige el archivo.';
  end if;
  if p_decision not in ('pendiente', 'usar_existente', 'crear', 'omitir') then
    raise exception 'DATOS_INVALIDOS: Decisión inválida.';
  end if;
  -- Solo se puede elegir entre las coincidencias mostradas.
  if p_decision = 'usar_existente' and (p_person_id is null or not exists (
       select 1 from jsonb_array_elements(v_row.candidates) c where (c ->> 'id')::uuid = p_person_id)) then
    raise exception 'DATOS_INVALIDOS: Elige una de las coincidencias.';
  end if;

  update ministry_import_rows
     set decision = p_decision,
         person_id = case when p_decision = 'usar_existente' then p_person_id end,
         decided_by = auth.uid()
   where id = p_row_id;
end;
$$;

revoke all on function ministry_import_decide(uuid, text, uuid) from public, anon;
grant execute on function ministry_import_decide(uuid, text, uuid) to authenticated;

-- Aplica las filas decididas. Repetible: lo ya aplicado no se toca, la
-- fila es la clave del alta (no crea dos veces) y la membresía activa es
-- única. Si al crear aparece una coincidencia nueva, la fila vuelve a
-- 'pendiente' con la lista actualizada.
create or replace function ministry_import_apply(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ministry uuid;
  v_row ministry_import_rows;
  v_res jsonb;
  v_ack uuid[];
  c_added int := 0;
  c_already int := 0;
  c_created int := 0;
  c_skipped int := 0;
  c_review int := 0;
begin
  select ministry_id into v_ministry from ministry_import_batches where id = p_batch_id for update;
  if v_ministry is null then
    raise exception 'DATOS_INVALIDOS: Lote no encontrado.';
  end if;
  if not can_manage_ministry_members(v_ministry) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  for v_row in
    select * from ministry_import_rows
     where batch_id = p_batch_id and processed_at is null and decision <> 'pendiente'
     order by row_number
     for update
  loop
    if v_row.decision = 'omitir' then
      update ministry_import_rows set result = 'omitida', processed_at = now() where id = v_row.id;
      c_skipped := c_skipped + 1;
      continue;
    end if;

    if v_row.decision = 'usar_existente' then
      v_res := ministry_add_person(v_ministry, v_row.person_id, null, null, null);
    else
      v_ack := array(select (c ->> 'id')::uuid from jsonb_array_elements(v_row.candidates) c);
      begin
        v_res := ministry_add_person(v_ministry, null, jsonb_build_object(
          'first_name', v_row.first_name, 'last_name', v_row.last_name,
          'email', v_row.email, 'phone', v_row.phone, 'birth_date', v_row.birth_date),
          v_ack, v_row.id);
      exception when others then
        if sqlerrm like 'COINCIDENCIAS:%' then
          update ministry_import_rows
             set decision = 'pendiente', match_level = 'posible',
                 candidates = ministry_import_match_row(v_ministry, v_row)
           where id = v_row.id;
          c_review := c_review + 1;
          continue;
        end if;
        raise;
      end;
    end if;

    update ministry_import_rows
       set result = case
                      when (v_res ->> 'person_created')::boolean then 'creada'
                      when v_res ->> 'membership' = 'agregada' then 'agregada'
                      else 'ya_integrante' end,
           result_person_id = (v_res ->> 'person_id')::uuid,
           processed_at = now()
     where id = v_row.id;

    if (v_res ->> 'person_created')::boolean then c_created := c_created + 1;
    elsif v_res ->> 'membership' = 'agregada' then c_added := c_added + 1;
    else c_already := c_already + 1;
    end if;
  end loop;

  update ministry_import_batches set last_applied_at = now() where id = p_batch_id;

  return jsonb_build_object(
    'creadas', c_created, 'agregadas', c_added, 'ya_integrantes', c_already,
    'omitidas', c_skipped, 'a_revisar', c_review,
    'pendientes', (select count(*) from ministry_import_rows
                    where batch_id = p_batch_id and processed_at is null and decision = 'pendiente'));
end;
$$;

revoke all on function ministry_import_apply(uuid) from public, anon;
grant execute on function ministry_import_apply(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Unificación de duplicados
-- ---------------------------------------------------------------------

-- Sin FK a propósito: la persona unificada ya no existe y la que quedó
-- podría borrarse después; el rastro se conserva igual.
create table person_merges (
  id uuid primary key default gen_random_uuid(),
  survivor_person_id uuid not null,
  merged_person_id uuid not null unique,
  kind text not null default 'unificacion'
    check (kind in ('unificacion', 'vinculacion_cuenta', 'vinculacion_revisada')),
  reason text not null,
  survivor_before jsonb not null,
  merged_snapshot jsonb not null,
  field_choices text[] not null default '{}',
  moved jsonb not null default '{}',
  details jsonb not null default '{}',
  merged_by uuid references auth.users (id) on delete set null,
  merged_at timestamptz not null default now()
);

comment on table person_merges is
  'Rastro de cada unificación: qué id quedó, cuál se unió (referencia del '
  'id anterior al definitivo), datos previos, quién y cuándo. Inmutable.';

create index person_merges_survivor_idx on person_merges (survivor_person_id);

alter table person_merges enable row level security;
create policy person_merges_select_admin on person_merges for select using (is_admin());

create or replace function person_merges_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El rastro de unificaciones no se modifica.' using errcode = '42501';
end;
$$;

create trigger person_merges_no_change
  before update or delete on person_merges
  for each row execute function person_merges_immutable();

-- Id anterior → id definitivo (sigue la cadena). Solo un id.
create or replace function resolve_person_id(p_person_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v uuid := p_person_id;
  v_next uuid;
  i int := 0;
begin
  if auth.uid() is null then
    return null;
  end if;
  loop
    select survivor_person_id into v_next from person_merges where merged_person_id = v;
    exit when v_next is null or i > 20;
    v := v_next;
    i := i + 1;
  end loop;
  return v;
end;
$$;

revoke all on function resolve_person_id(uuid) from public, anon;
grant execute on function resolve_person_id(uuid) to authenticated;

-- "No son la misma persona": la pareja deja de sugerirse.
create table person_duplicate_dismissals (
  person_a uuid not null references people (id) on delete cascade,
  person_b uuid not null references people (id) on delete cascade,
  reason text,
  dismissed_by uuid references auth.users (id) on delete set null,
  dismissed_at timestamptz not null default now(),
  primary key (person_a, person_b),
  check (person_a < person_b)
);

alter table person_duplicate_dismissals enable row level security;
create policy person_duplicate_dismissals_select on person_duplicate_dismissals
  for select using (has_directory_access());

create or replace function person_duplicate_pairs(p_limit int default 100)
returns table (
  person_a uuid,
  name_a text,
  person_b uuid,
  name_b text,
  level text,
  reasons text[],
  both_accounts boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_directory_access() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return query
  with base as (
    select * from people where not finance_only and anonymized_at is null
  ),
  pairs as (
    select a.id as a_id, b.id as b_id, a.first_name || ' ' || a.last_name as an,
      b.first_name || ' ' || b.last_name as bn,
      (a.name_key <> '' and a.name_key = b.name_key) as name_exact,
      (a.name_key <> b.name_key and (
         (cardinality(string_to_array(a.name_key, ' ')) >= 2
          and string_to_array(a.name_key, ' ') <@ string_to_array(b.name_key, ' '))
         or (cardinality(string_to_array(b.name_key, ' ')) >= 2
          and string_to_array(b.name_key, ' ') <@ string_to_array(a.name_key, ' ')))) as name_similar,
      (a.email_key is not null and a.email_key = b.email_key) as email_eq,
      (a.phone_key is not null and a.phone_key = b.phone_key) as phone_eq,
      (a.birth_date is not null and a.birth_date = b.birth_date) as birth_eq,
      (a.birth_date is not null and b.birth_date is not null and a.birth_date <> b.birth_date) as birth_conflict,
      (split_part(a.name_key, ' ', 1) = split_part(b.name_key, ' ', 1)) as same_first
    from base a
    join base b on a.id < b.id and (
      (a.email_key is not null and a.email_key = b.email_key)
      or (a.phone_key is not null and a.phone_key = b.phone_key)
      or (a.name_key <> '' and a.name_key = b.name_key))
  )
  select p.a_id, p.an, p.b_id, p.bn,
    case when (p.name_exact or p.name_similar) and (p.email_eq or p.phone_eq or p.birth_eq)
              and not p.birth_conflict then 'confiable' else 'posible' end,
    array_remove(array[
      case when p.name_exact then 'Mismo nombre' end,
      case when p.name_similar then 'Nombre parecido' end,
      case when p.email_eq then 'Mismo correo' end,
      case when p.phone_eq then 'Mismo teléfono' end,
      case when p.birth_eq then 'Misma fecha de nacimiento' end,
      case when p.birth_conflict then 'Fecha de nacimiento distinta' end
    ], null),
    exists (select 1 from profiles x where x.person_id = p.a_id)
      and exists (select 1 from profiles y where y.person_id = p.b_id)
  from pairs p
  where (p.name_exact or p.name_similar or p.same_first)
    and not (p.birth_conflict and not p.email_eq and not p.phone_eq)
    and not exists (select 1 from person_duplicate_dismissals d
                     where d.person_a = p.a_id and d.person_b = p.b_id)
  order by 5, (p.email_eq::int + p.phone_eq::int + p.birth_eq::int) desc, p.an, p.a_id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function person_duplicate_pairs(int) from public, anon;
grant execute on function person_duplicate_pairs(int) to authenticated;

create or replace function person_duplicate_dismiss(p_a uuid, p_b uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_directory_access() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'DATOS_INVALIDOS: Elige dos personas distintas.';
  end if;
  insert into person_duplicate_dismissals (person_a, person_b, reason, dismissed_by)
  values (least(p_a, p_b), greatest(p_a, p_b), left(nullif(btrim(coalesce(p_reason, '')), ''), 300), auth.uid())
  on conflict do nothing;
  perform log_audit_event('person.duplicate_dismiss', 'person', least(p_a, p_b),
    jsonb_build_object('other', greatest(p_a, p_b), 'reason', p_reason));
end;
$$;

revoke all on function person_duplicate_dismiss(uuid, uuid, text) from public, anon;
grant execute on function person_duplicate_dismiss(uuid, uuid, text) to authenticated;

-- Campos que se pueden elegir en un conflicto.
create or replace function person_merge_fields()
returns text[]
language sql
immutable
as $$
  select array['first_name', 'last_name', 'preferred_name', 'birth_date', 'gender', 'email',
               'phone', 'address_line', 'address_line2', 'city', 'postal_code', 'country',
               'marital_status', 'membership_status', 'joined_at', 'photo_url'];
$$;

-- Cuántas relaciones tiene una persona, por módulo. Lo financiero solo
-- se detalla a quien tiene acceso financiero.
create or replace function person_relation_counts(p_person_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_strip_nulls(jsonb_build_object(
    'matriculas', nullif((select count(*) from enrollments where person_id = p_person_id), 0),
    'asistencia_clases', nullif((select count(*) from attendance_records where person_id = p_person_id), 0),
    'maestro_de_clases', nullif((select count(*) from class_offerings where teacher_person_id = p_person_id), 0),
    'ministerios', nullif((select count(*) from ministry_memberships where person_id = p_person_id), 0),
    'lider_de_ministerios', nullif((select count(*) from ministries where leader_person_id = p_person_id), 0),
    'actividades', nullif((select count(*) from activity_participants where person_id = p_person_id), 0),
    'responsable_de_actividades', nullif((select count(*) from activities where responsible_person_id = p_person_id), 0),
    'inscripciones', nullif((select count(*) from activity_registrations where person_id = p_person_id), 0),
    'asistencia_cultos', nullif((select count(*) from service_checkins where person_id = p_person_id and voided_at is null), 0),
    'seguimiento', nullif((select count(*) from visitor_follow_ups where person_id = p_person_id), 0),
    'peticiones_oracion', nullif((select count(*) from prayer_requests where requester_person_id = p_person_id), 0),
    'encuestas', nullif((select count(*) from survey_responses where person_id = p_person_id), 0)
  )) into v;
  if has_finance_access() then
    v := v || jsonb_strip_nulls(jsonb_build_object(
      'donaciones', nullif((select count(*) from donations where person_id = p_person_id), 0),
      'cartas_donativos', nullif((select count(*) from donation_letters where person_id = p_person_id), 0),
      'certificaciones', nullif((select count(*) from person_certifications where person_id = p_person_id), 0)));
  end if;
  return v;
end;
$$;

revoke all on function person_relation_counts(uuid) from public, anon, authenticated;

create or replace function person_merge_preview(p_survivor uuid, p_merged uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s people%rowtype;
  m people%rowtype;
  v_conflicts jsonb := '[]';
  f text;
  sv text;
  mv text;
  v_block text;
begin
  if not is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into s from people where id = p_survivor;
  select * into m from people where id = p_merged;
  if s.id is null or m.id is null then
    raise exception 'DATOS_INVALIDOS: Persona no encontrada.';
  end if;

  foreach f in array person_merge_fields() loop
    sv := to_jsonb(s) ->> f;
    mv := to_jsonb(m) ->> f;
    if sv is not null and mv is not null and sv <> mv then
      v_conflicts := v_conflicts || jsonb_build_object('field', f, 'survivor', sv, 'merged', mv);
    end if;
  end loop;

  v_block := case
    when s.id = m.id then 'Es la misma persona.'
    when s.finance_only or m.finance_only then 'Los donantes de Finanzas se vinculan desde Finanzas → Vincular.'
    when s.anonymized_at is not null or m.anonymized_at is not null then 'Una de las dos borró su perfil.'
    when exists (select 1 from profiles where person_id = s.id)
         and exists (select 1 from profiles where person_id = m.id)
      then 'Las dos tienen cuenta de acceso. Un administrador debe resolver primero cuál cuenta queda (no se unen dos cuentas).'
  end;

  return jsonb_build_object(
    'survivor', to_jsonb(s) - 'name_key' - 'email_key' - 'phone_key'
       || jsonb_build_object('has_account', exists (select 1 from profiles where person_id = s.id),
                             'relations', person_relation_counts(s.id)),
    'merged', to_jsonb(m) - 'name_key' - 'email_key' - 'phone_key'
       || jsonb_build_object('has_account', exists (select 1 from profiles where person_id = m.id),
                             'relations', person_relation_counts(m.id)),
    'conflicts', v_conflicts,
    'shared_ministries', coalesce((
      select jsonb_agg(mi.name order by mi.name) from ministries mi
       where exists (select 1 from ministry_memberships a where a.ministry_id = mi.id and a.person_id = s.id and a.left_at is null)
         and exists (select 1 from ministry_memberships b where b.ministry_id = mi.id and b.person_id = m.id and b.left_at is null)), '[]'),
    'finance_detail_visible', has_finance_access(),
    'blocked', v_block
  );
end;
$$;

revoke all on function person_merge_preview(uuid, uuid) from public, anon;
grant execute on function person_merge_preview(uuid, uuid) to authenticated;

-- Núcleo de la unificación (interno). Todo en la misma transacción: si
-- algo no se puede trasladar, no cambia nada.
create or replace function person_merge_core(
  p_survivor uuid,
  p_merged uuid,
  p_reason text,
  p_take_from_merged text[],
  p_actor uuid,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s people%rowtype;
  m people%rowtype;
  v_take text[] := coalesce(p_take_from_merged, '{}');
  v_s_user uuid;
  v_m_user uuid;
  v_moved jsonb := '{}';
  v_details jsonb := '{}';
  v_resolved jsonb := '[]';
  v_n int;
  v_had_donations boolean;
  v_old donations%rowtype;
  v_new donations%rowtype;
  v_date date;
  r record;
  fk record;
begin
  if p_survivor is null or p_merged is null or p_survivor = p_merged then
    raise exception 'DATOS_INVALIDOS: Elige dos personas distintas.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'DATOS_INVALIDOS: Escribe el motivo (mínimo 5 caracteres).';
  end if;
  if exists (select 1 from unnest(v_take) t where not (t = any (person_merge_fields()))) then
    raise exception 'DATOS_INVALIDOS: Campo inválido.';
  end if;

  -- Candado en orden fijo (evita bloqueos cruzados).
  perform 1 from people where id in (p_survivor, p_merged) order by id for update;
  select * into s from people where id = p_survivor;
  select * into m from people where id = p_merged;
  if s.id is null or m.id is null then
    raise exception 'DATOS_INVALIDOS: Persona no encontrada.';
  end if;
  if s.finance_only or m.finance_only then
    raise exception 'DATOS_INVALIDOS: Los donantes de Finanzas se vinculan desde Finanzas.';
  end if;
  if s.anonymized_at is not null or m.anonymized_at is not null then
    raise exception 'DATOS_INVALIDOS: Una de las dos personas borró su perfil.';
  end if;

  select id into v_s_user from profiles where person_id = s.id for update;
  select id into v_m_user from profiles where person_id = m.id for update;
  if v_s_user is not null and v_m_user is not null then
    raise exception 'DOS_CUENTAS: Las dos personas tienen cuenta de acceso. No se unen dos cuentas automáticamente.';
  end if;

  -- 1. Datos de la persona que queda.
  update people set
    first_name = case when 'first_name' = any (v_take) then m.first_name else s.first_name end,
    last_name = case when 'last_name' = any (v_take) then m.last_name else s.last_name end,
    preferred_name = case when 'preferred_name' = any (v_take) then m.preferred_name else coalesce(s.preferred_name, m.preferred_name) end,
    birth_date = case when 'birth_date' = any (v_take) then m.birth_date else coalesce(s.birth_date, m.birth_date) end,
    gender = case when 'gender' = any (v_take) then m.gender else coalesce(s.gender, m.gender) end,
    email = case when 'email' = any (v_take) then m.email else coalesce(s.email, m.email) end,
    phone = case when 'phone' = any (v_take) then m.phone else coalesce(s.phone, m.phone) end,
    address_line = case when 'address_line' = any (v_take) then m.address_line else coalesce(s.address_line, m.address_line) end,
    address_line2 = case when 'address_line2' = any (v_take) then m.address_line2 else coalesce(s.address_line2, m.address_line2) end,
    city = case when 'city' = any (v_take) then m.city else coalesce(s.city, m.city) end,
    postal_code = case when 'postal_code' = any (v_take) then m.postal_code else coalesce(s.postal_code, m.postal_code) end,
    country = case when 'country' = any (v_take) then m.country else coalesce(s.country, m.country) end,
    marital_status = case when 'marital_status' = any (v_take) then m.marital_status else coalesce(s.marital_status, m.marital_status) end,
    membership_status = case when 'membership_status' = any (v_take) then m.membership_status else s.membership_status end,
    joined_at = case when 'joined_at' = any (v_take) then m.joined_at else coalesce(s.joined_at, m.joined_at) end,
    photo_url = case when 'photo_url' = any (v_take) then m.photo_url else coalesce(s.photo_url, m.photo_url) end,
    -- Las notas no se pierden: se juntan.
    notes = case
              when m.notes is null or m.notes = coalesce(s.notes, '') then s.notes
              when s.notes is null then m.notes
              else left(s.notes || E'\n---\n' || m.notes, 2000) end,
    updated_by = p_actor
  where id = s.id;

  -- 2. La cuenta (si solo la tenía la persona unida) pasa a la que queda.
  if v_m_user is not null then
    perform set_config('app.allow_person_id_change', 'true', true);
    update profiles set person_id = s.id where id = v_m_user;
    perform set_config('app.allow_person_id_change', 'false', true);
    v_moved := v_moved || jsonb_build_object('cuenta', 1);
  end if;
  update portal_invitations set revoked_at = now(), revoked_by = p_actor
   where person_id = m.id and used_at is null and revoked_at is null;

  -- 3. Relaciones con unicidad: se combinan sin perder información.

  -- Ministerios activos en los dos: queda una fila con la fecha más
  -- antigua, la responsabilidad mayor y las notas juntas.
  for r in
    select a.id as s_row, b.id as m_row, to_jsonb(b) as m_json, a.role_in_ministry as s_role,
           b.role_in_ministry as m_role, b.joined_at as m_joined, b.notes as m_notes
      from ministry_memberships a
      join ministry_memberships b on b.ministry_id = a.ministry_id
     where a.person_id = s.id and b.person_id = m.id and a.left_at is null and b.left_at is null
  loop
    update ministry_memberships set
      joined_at = least(joined_at, r.m_joined),
      role_in_ministry = case
        when 'lider' in (r.s_role, r.m_role) then 'lider'::ministry_member_role
        when 'colider' in (r.s_role, r.m_role) then 'colider'::ministry_member_role
        else 'miembro'::ministry_member_role end,
      notes = case when r.m_notes is null or r.m_notes = coalesce(notes, '') then notes
                   when notes is null then r.m_notes
                   else left(notes || ' / ' || r.m_notes, 500) end
     where id = r.s_row;
    delete from ministry_memberships where id = r.m_row;
    v_resolved := v_resolved || jsonb_build_object('tabla', 'ministry_memberships', 'fila', r.m_json);
  end loop;

  -- Matrícula repetida: queda el estado más avanzado.
  for r in
    select a.id as s_row, b.id as m_row, to_jsonb(b) as m_json, b.status as m_status, a.status as s_status
      from enrollments a join enrollments b on b.class_offering_id = a.class_offering_id
     where a.person_id = s.id and b.person_id = m.id
  loop
    update enrollments set status = case
        when 'completado' in (r.s_status, r.m_status) then 'completado'::enrollment_status
        when 'en_progreso' in (r.s_status, r.m_status) then 'en_progreso'::enrollment_status
        when 'inscrito' in (r.s_status, r.m_status) then 'inscrito'::enrollment_status
        else r.s_status end
     where id = r.s_row;
    delete from enrollments where id = r.m_row;
    v_resolved := v_resolved || jsonb_build_object('tabla', 'enrollments', 'fila', r.m_json);
  end loop;

  -- Asistencia a la misma sesión: queda la más favorable.
  for r in
    select a.id as s_row, b.id as m_row, to_jsonb(b) as m_json, a.status as s_status, b.status as m_status
      from attendance_records a join attendance_records b on b.class_session_id = a.class_session_id
     where a.person_id = s.id and b.person_id = m.id
  loop
    update attendance_records set status = case
        when 'presente' in (r.s_status, r.m_status) then 'presente'::attendance_status
        when 'tarde' in (r.s_status, r.m_status) then 'tarde'::attendance_status
        when 'excusado' in (r.s_status, r.m_status) then 'excusado'::attendance_status
        else r.s_status end
     where id = r.s_row;
    delete from attendance_records where id = r.m_row;
    v_resolved := v_resolved || jsonb_build_object('tabla', 'attendance_records', 'fila', r.m_json);
  end loop;

  -- Actividad: asistió si asistió cualquiera de los dos registros.
  for r in
    select a.id as s_row, b.id as m_row, to_jsonb(b) as m_json, b.attended as m_att
      from activity_participants a join activity_participants b on b.activity_id = a.activity_id
     where a.person_id = s.id and b.person_id = m.id
  loop
    update activity_participants set attended = attended or r.m_att where id = r.s_row;
    delete from activity_participants where id = r.m_row;
    v_resolved := v_resolved || jsonb_build_object('tabla', 'activity_participants', 'fila', r.m_json);
  end loop;

  -- Check-in vigente en el mismo culto: el de la persona unida se anula
  -- (no se borra).
  update service_checkins b
     set voided_at = now(), voided_by = p_actor,
         void_reason = 'Unificación de personas: asistencia repetida'
   where b.person_id = m.id and b.voided_at is null
     and exists (select 1 from service_checkins a
                  where a.service_id = b.service_id and a.person_id = s.id and a.voided_at is null);

  -- Encuesta respondida por los dos: la respuesta extra se conserva sin
  -- persona (las respuestas no se pierden).
  for r in
    select b.id as m_row from survey_responses a join survey_responses b on b.survey_id = a.survey_id
     where a.person_id = s.id and b.person_id = m.id
  loop
    update survey_responses set person_id = null where id = r.m_row;
    v_resolved := v_resolved || jsonb_build_object('tabla', 'survey_responses', 'id', r.m_row);
  end loop;

  -- 4. Donaciones: cambia solo la persona; importe, fecha, tipo, método y
  -- referencia quedan igual, con revisión (mismo patrón que
  -- finance_link_donor). Las cartas pasan con versión siguiente y las del
  -- período se marcan para revisión.
  v_had_donations := exists (select 1 from donations where person_id = s.id);
  v_n := 0;
  for v_old in select * from donations where person_id = m.id order by donation_date for update loop
    update donations set person_id = s.id, version = version + 1, updated_at = now(), updated_by = p_actor
     where id = v_old.id returning * into v_new;
    insert into donation_revisions (donation_id, revision, action, before, after, reason, actor_user_id)
    values (v_old.id, v_new.version, 'corregida', donation_row_json(v_old), donation_row_json(v_new),
            'Unificación de personas: ' || btrim(p_reason), p_actor);
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    v_moved := v_moved || jsonb_build_object('donaciones', v_n);
  end if;
  update donation_letters l
     set person_id = s.id,
         version = l.version + coalesce((
           select max(t.version) from donation_letters t
            where t.person_id = s.id and t.period_start = l.period_start and t.period_end = l.period_end), 0)
   where l.person_id = m.id;
  if v_n > 0 and v_had_donations then
    for v_date in select distinct donation_date from donations where person_id = s.id loop
      perform flag_letters_for_review(s.id, v_date, 'Se unificaron dos registros de esta persona.');
    end loop;
  end if;

  -- 5. Listas de candidatos (no son FK).
  update activity_registrations set candidate_person_ids = array_replace(candidate_person_ids, m.id, s.id)
   where m.id = any (candidate_person_ids);
  update import_rows set candidate_person_ids = array_replace(candidate_person_ids, m.id, s.id)
   where m.id = any (candidate_person_ids);
  update donation_import_donors set candidate_person_ids = array_replace(candidate_person_ids, m.id, s.id)
   where m.id = any (candidate_person_ids);
  delete from person_duplicate_dismissals where m.id in (person_a, person_b);
  delete from finance_link_dismissals f
   where f.person_id = m.id
     and exists (select 1 from finance_link_dismissals g where g.donor_id = f.donor_id and g.person_id = s.id);

  -- 6. Todo lo demás que apunta a la persona (también tablas futuras).
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.people'::regclass
       and cardinality(c.conkey) = 1
       and c.conrelid <> 'public.profiles'::regclass
       and c.conrelid <> 'public.person_duplicate_dismissals'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using s.id, m.id;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_moved := v_moved || jsonb_build_object(fk.tbl::text || '.' || fk.col,
        coalesce((v_moved ->> (fk.tbl::text || '.' || fk.col))::int, 0) + v_n);
    end if;
  end loop;

  v_details := jsonb_build_object('filas_combinadas', v_resolved);

  insert into person_merges (survivor_person_id, merged_person_id, kind, reason, survivor_before,
                             merged_snapshot, field_choices, moved, details, merged_by)
  values (s.id, m.id, p_kind, btrim(p_reason), to_jsonb(s), to_jsonb(m), v_take, v_moved,
          v_details, p_actor);

  delete from people where id = m.id;

  insert into audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'person.merge', 'person', s.id,
          jsonb_build_object('merged_person_id', m.id, 'kind', p_kind, 'reason', btrim(p_reason),
                             'moved', v_moved));

  return jsonb_build_object('survivor_id', s.id, 'merged_id', m.id, 'moved', v_moved,
                            'combined', jsonb_array_length(v_resolved));
end;
$$;

revoke all on function person_merge_core(uuid, uuid, text, text[], uuid, text) from public, anon, authenticated;

create or replace function person_merge(
  p_survivor uuid,
  p_merged uuid,
  p_reason text,
  p_take_from_merged text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return person_merge_core(p_survivor, p_merged, p_reason, p_take_from_merged, auth.uid(), 'unificacion');
end;
$$;

revoke all on function person_merge(uuid, uuid, text, text[]) from public, anon;
grant execute on function person_merge(uuid, uuid, text, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Vincular una cuenta con su registro anterior
-- ---------------------------------------------------------------------
-- Quien se registra por su cuenta nunca ve listas ni datos de nadie. El
-- servidor busca UNA coincidencia confiable sin cuenta que tenga correo
-- registrado y le manda un código a ESE correo (no al recién dado). La
-- respuesta es la misma haya o no coincidencia. Sin verificación, se pide
-- revisión a un administrador y la persona sigue usando su cuenta tal cual.

create table identity_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_person_id uuid references people (id) on delete cascade,
  channel text check (channel in ('email', 'sms')),
  -- Por qué no hubo código (para la revisión): sin_coincidencia, ambigua,
  -- sin_correo, ya_vinculada.
  outcome text,
  code_hash text,
  attempts int not null default 0,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'verificada', 'fallida', 'reemplazada')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index identity_claims_user_idx on identity_claims (user_id, created_at desc);
alter table identity_claims enable row level security;
-- Sin políticas: solo el servidor (service_role) y las funciones.

create table identity_review_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  submitted jsonb not null default '{}',
  status text not null default 'pendiente' check (status in ('pendiente', 'vinculada', 'descartada')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  linked_person_id uuid
);

create unique index identity_review_one_pending_idx on identity_review_requests (user_id)
  where status = 'pendiente';

alter table identity_review_requests enable row level security;
create policy identity_review_select_admin on identity_review_requests for select using (is_admin());

-- Solo el servidor (service_role): devuelve el código para enviarlo. Si un
-- usuario pudiera llamarla, se saltaría la verificación.
create or replace function identity_claim_start(p_user_id uuid, p_phone text, p_birth date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person people%rowtype;
  v_email text;
  v_targets uuid[];
  v_target people%rowtype;
  v_outcome text;
  v_code text;
  v_claim uuid := gen_random_uuid();
begin
  select pe.* into v_person from profiles pr join people pe on pe.id = pr.person_id
   where pr.id = p_user_id;
  if v_person.id is null then
    raise exception 'DATOS_INVALIDOS: La cuenta no tiene persona.';
  end if;
  select email into v_email from auth.users where id = p_user_id;

  if (select count(*) from identity_claims
       where user_id = p_user_id and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('status', 'limite');
  end if;

  update identity_claims set status = 'reemplazada'
   where user_id = p_user_id and status = 'pendiente';

  select array_agg(c.person_id) into v_targets
    from person_match_candidates(v_person.first_name, v_person.last_name, v_email, p_phone,
                                 p_birth, null, false, v_person.id, 25) c
   where c.level = 'confiable'
     and not exists (select 1 from profiles pr where pr.person_id = c.person_id);

  if v_targets is null then
    v_outcome := 'sin_coincidencia';
  elsif cardinality(v_targets) > 1 then
    v_outcome := 'ambigua';
  else
    select * into v_target from people where id = v_targets[1];
    if v_target.email_key is null then
      v_outcome := 'sin_correo';
      v_target := null;
    end if;
  end if;

  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');

  insert into identity_claims (id, user_id, target_person_id, channel, outcome, code_hash, expires_at)
  values (v_claim, p_user_id, v_target.id, case when v_target.id is not null then 'email' end,
          coalesce(v_outcome, 'codigo_enviado'),
          encode(extensions.digest(v_claim::text || ':' || v_code, 'sha256'), 'hex'),
          now() + interval '15 minutes');

  return jsonb_build_object(
    'status', 'ok',
    'claim_id', v_claim,
    'send_to', v_target.email::text,
    'code', case when v_target.id is not null then v_code end
  );
end;
$$;

revoke all on function identity_claim_start(uuid, text, date) from public, anon, authenticated;
grant execute on function identity_claim_start(uuid, text, date) to service_role;

-- Solo el servidor. Mismo resultado para "no había coincidencia" y
-- "código incorrecto". Máximo 5 intentos por código.
create or replace function identity_claim_verify(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim identity_claims%rowtype;
  v_person uuid;
begin
  select * into v_claim from identity_claims
   where user_id = p_user_id and status = 'pendiente'
   order by created_at desc limit 1
   for update;
  if v_claim.id is null or v_claim.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'vencido');
  end if;
  if v_claim.attempts >= 5 then
    update identity_claims set status = 'fallida' where id = v_claim.id;
    return jsonb_build_object('ok', false, 'reason', 'bloqueado');
  end if;
  update identity_claims set attempts = attempts + 1 where id = v_claim.id;

  if v_claim.target_person_id is null
     or v_claim.code_hash <> encode(extensions.digest(v_claim.id::text || ':' || btrim(coalesce(p_code, '')), 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'reason', 'incorrecto', 'remaining', 4 - v_claim.attempts);
  end if;

  select person_id into v_person from profiles where id = p_user_id;
  -- Ya la reclamó otra cuenta mientras tanto.
  if exists (select 1 from profiles where person_id = v_claim.target_person_id) then
    update identity_claims set status = 'fallida', outcome = 'ya_vinculada' where id = v_claim.id;
    return jsonb_build_object('ok', false, 'reason', 'ya_vinculada');
  end if;

  perform person_merge_core(v_claim.target_person_id, v_person,
    'Vinculación verificada con código enviado al correo registrado', '{}', p_user_id,
    'vinculacion_cuenta');

  update identity_claims set status = 'verificada', verified_at = now() where id = v_claim.id;
  return jsonb_build_object('ok', true, 'person_id', v_claim.target_person_id);
end;
$$;

revoke all on function identity_claim_verify(uuid, text) from public, anon, authenticated;
grant execute on function identity_claim_verify(uuid, text) to service_role;

-- La propia persona pide revisión (no ve nada de nadie).
create or replace function request_identity_review(p_phone text, p_birth date, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_note, '')) > 500 or char_length(coalesce(p_phone, '')) > 30 then
    raise exception 'DATOS_INVALIDOS: El texto es demasiado largo.';
  end if;
  insert into identity_review_requests (user_id, submitted)
  values (auth.uid(), jsonb_strip_nulls(jsonb_build_object(
    'phone', nullif(btrim(coalesce(p_phone, '')), ''), 'birth_date', p_birth,
    'note', nullif(btrim(coalesce(p_note, '')), ''))))
  on conflict (user_id) where status = 'pendiente'
  do update set submitted = excluded.submitted, created_at = now();
end;
$$;

revoke all on function request_identity_review(text, date, text) from public, anon;
grant execute on function request_identity_review(text, date, text) to authenticated;

create or replace function my_identity_review_pending()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from identity_review_requests
                  where user_id = auth.uid() and status = 'pendiente');
$$;

revoke all on function my_identity_review_pending() from public, anon;
grant execute on function my_identity_review_pending() to authenticated;

create or replace function identity_review_list()
returns table (
  request_id uuid,
  created_at timestamptz,
  account_email text,
  person_id uuid,
  person_name text,
  submitted jsonb,
  last_outcome text,
  candidates jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return query
    select r.id, r.created_at, u.email::text, pe.id, pe.first_name || ' ' || pe.last_name,
      r.submitted,
      (select c.outcome from identity_claims c where c.user_id = r.user_id order by c.created_at desc limit 1),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.first_name || ' ' || p.last_name, 'level', mc.level,
          'reasons', mc.reasons, 'email', p.email, 'phone', p.phone, 'birth_date', p.birth_date,
          'has_account', exists (select 1 from profiles x where x.person_id = p.id)))
          from person_match_candidates(pe.first_name, pe.last_name, u.email,
                 r.submitted ->> 'phone', nullif(r.submitted ->> 'birth_date', '')::date,
                 null, false, pe.id) mc
          join people p on p.id = mc.person_id), '[]')
    from identity_review_requests r
    join auth.users u on u.id = r.user_id
    join profiles pr on pr.id = r.user_id
    join people pe on pe.id = pr.person_id
    where r.status = 'pendiente'
    order by r.created_at;
end;
$$;

revoke all on function identity_review_list() from public, anon;
grant execute on function identity_review_list() to authenticated;

-- El administrador vincula (después de verificar en persona) o descarta.
create or replace function identity_review_resolve(p_request_id uuid, p_target_person_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req identity_review_requests%rowtype;
  v_person uuid;
begin
  if not is_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  select * into v_req from identity_review_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pendiente' then
    raise exception 'DATOS_INVALIDOS: La solicitud ya se resolvió.';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'DATOS_INVALIDOS: Escribe cómo se verificó (mínimo 5 caracteres).';
  end if;

  if p_target_person_id is not null then
    select person_id into v_person from profiles where id = v_req.user_id;
    if exists (select 1 from profiles where person_id = p_target_person_id) then
      raise exception 'DATOS_INVALIDOS: Esa persona ya tiene una cuenta vinculada.';
    end if;
    perform person_merge_core(p_target_person_id, v_person, btrim(p_note), '{}', auth.uid(),
                              'vinculacion_revisada');
  end if;

  update identity_review_requests
     set status = case when p_target_person_id is null then 'descartada' else 'vinculada' end,
         resolved_by = auth.uid(), resolved_at = now(), resolution_note = btrim(p_note),
         linked_person_id = p_target_person_id
   where id = p_request_id;
end;
$$;

revoke all on function identity_review_resolve(uuid, uuid, text) from public, anon;
grant execute on function identity_review_resolve(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
