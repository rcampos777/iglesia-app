-- Donantes solo de Finanzas e importación de diezmos y ofrendas
-- (decisión 2026-10-11, docs/decisions.md; ver docs/finance.md §9).
--
-- 1. `people.finance_only`: personas creadas por Finanzas para registrar
--    donaciones (importación o "Crear donante"). Una política RESTRICTIVA
--    las oculta de toda lectura/escritura directa — directorio, conteos,
--    reportes, check-in, clases, ministerios — para todos los roles,
--    incluidos administrador y SuperAdmin. Finanzas las ve solo por sus
--    funciones (security definer + has_finance_access()).
-- 2. Importación por lotes (staging → revisión humana → donaciones). Las
--    filas se agrupan por donante (nombre normalizado): un nombre que se
--    repite en 50 filas es UN donante. Cada donante se enlaza a una persona
--    existente, se crea como donante de Finanzas, se marca anónimo o se
--    omite; siempre lo decide una persona (nunca se enlaza solo).
-- 3. Vincular: cuando el donante ya existe en el directorio (se registró,
--    lo importó Seguimiento…), Finanzas mueve sus donaciones y cartas a esa
--    persona y el registro de Finanzas desaparece. Un solo registro.

alter type person_source add value if not exists 'finanzas';
-- "Pacto" aparece en el registro de la iglesia como tipo propio.
alter type donation_type add value if not exists 'pacto';

alter table people
  add column finance_only boolean not null default false;

comment on column people.finance_only is
  'Donante creado por Finanzas. Oculto del directorio para todos (política '
  'restrictiva); solo las funciones de Finanzas lo leen. Se elimina al '
  'vincularlo con la persona real (finance_link_donor).';

create index people_finance_only_idx on people (id) where finance_only;

create policy people_hide_finance_only_select on people
  as restrictive for select using (not finance_only);
create policy people_hide_finance_only_insert on people
  as restrictive for insert with check (not finance_only);
create policy people_hide_finance_only_update on people
  as restrictive for update using (not finance_only) with check (not finance_only);
create policy people_hide_finance_only_delete on people
  as restrictive for delete using (not finance_only);

-- ---------------------------------------------------------------------
-- 1. Nombres: clave normalizada y candidatos (sugerencias, nunca enlace
--    automático: dos personas pueden llamarse igual).
-- ---------------------------------------------------------------------

create or replace function finance_name_key(p text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));
$$;

-- Coincide si el nombre es igual, o si todas las palabras (≥ 2) de uno
-- están en el otro: "Juan Perez" ~ "Juan Carlos Pérez Rivera".
create or replace function finance_name_candidates(p_key text, p_include_finance_only boolean)
returns table (person_id uuid, exact boolean)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select p_key as k, string_to_array(p_key, ' ') as t),
  pk as (
    select p.id, p.first_name, p.last_name,
      finance_name_key(p.first_name || ' ' || p.last_name) as k,
      string_to_array(finance_name_key(
        p.first_name || ' ' || p.last_name || ' ' || coalesce(p.preferred_name, '')), ' ') as t
    from people p
    where p_include_finance_only or not p.finance_only
  )
  select pk.id, pk.k = q.k
    from pk, q
   where q.k <> ''
     and (
       pk.k = q.k
       or (cardinality(q.t) >= 2 and q.t <@ pk.t)
       or (cardinality(string_to_array(pk.k, ' ')) >= 2 and string_to_array(pk.k, ' ') <@ q.t)
     )
   order by 2 desc, pk.last_name, pk.first_name, pk.id
   limit 5;
$$;

revoke all on function finance_name_candidates(text, boolean) from public, anon, authenticated;

-- "Juan Pérez Rivera" → (Juan, Pérez Rivera). Editable antes de crear.
create or replace function finance_split_name(p_name text, out first_name text, out last_name text)
language plpgsql
immutable
as $$
declare
  t text[] := string_to_array(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ' ');
  n int := coalesce(cardinality(t), 0);
begin
  if n = 0 then
    first_name := ''; last_name := '';
  elsif n <= 3 then
    first_name := t[1]; last_name := coalesce(array_to_string(t[2:n], ' '), '');
  else
    first_name := array_to_string(t[1:2], ' '); last_name := array_to_string(t[3:n], ' ');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Búsqueda de Finanzas: sin acentos y marcando a los donantes de
--    Finanzas (misma firma que 0035).
-- ---------------------------------------------------------------------

create or replace function finance_search_people(p_query text)
returns table (person_id uuid, display_name text, hint text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_terms text[] := string_to_array(finance_name_key(p_query), ' ');
begin
  perform finance_require_access();
  if length(finance_name_key(p_query)) < 2 then
    return;
  end if;
  return query
    select p.id, p.first_name || ' ' || p.last_name,
      case
        when p.finance_only then 'Donante (solo Finanzas)'
        when length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 4 then
          'Tel. termina en ' || right(regexp_replace(p.phone, '\D', '', 'g'), 4)
        when p.email is not null then left(p.email::text, 1) || '•••@' || split_part(p.email::text, '@', 2)
        else null
      end
    from people p
    where not exists (
      select 1 from unnest(v_terms) t
      where position(t in finance_name_key(
        p.first_name || ' ' || p.last_name || ' ' || coalesce(p.preferred_name, ''))) = 0
    )
    order by p.last_name, p.first_name, p.id
    limit 20;
end;
$$;

create or replace function finance_person_info(p_person_id uuid)
returns table (display_name text, finance_only boolean, has_account boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query
    select p.first_name || ' ' || p.last_name, p.finance_only,
      exists (select 1 from profiles pr where pr.person_id = p.id)
    from people p where p.id = p_person_id;
end;
$$;

revoke all on function finance_person_info(uuid) from public, anon;
grant execute on function finance_person_info(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Crear donante (desde "Registrar donación").
-- ---------------------------------------------------------------------

create or replace function finance_create_donor(
  p_first_name text,
  p_last_name text,
  p_confirm_same_name boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g'));
  v_last text := btrim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  perform finance_require_access();
  if v_first = '' or char_length(v_first) > 100 or char_length(v_last) > 100 then
    raise exception 'DATOS_INVALIDOS: Escribe el nombre (máx. 100 caracteres).';
  end if;
  if not coalesce(p_confirm_same_name, false) and exists (
    select 1 from finance_name_candidates(finance_name_key(v_first || ' ' || v_last), true) c
     where c.exact
  ) then
    raise exception 'MISMO_NOMBRE: Ya existe una persona con ese nombre. Búscala; si de verdad es otra persona, confirma.';
  end if;

  insert into people (first_name, last_name, source, finance_only, created_by, updated_by)
  values (v_first, v_last, 'finanzas', true, auth.uid(), auth.uid())
  returning id into v_id;

  perform finance_log('crear_donante', 'people', v_id, '{}');
  return v_id;
end;
$$;

revoke all on function finance_create_donor(text, text, boolean) from public, anon;
grant execute on function finance_create_donor(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Staging de importación (solo Finanzas; escritura solo por funciones)
-- ---------------------------------------------------------------------

create table donation_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (char_length(file_name) between 1 and 200),
  status text not null default 'en_revision'
    check (status in ('en_revision', 'completado', 'descartado')),
  total_rows int not null default 0,
  imported_count int not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table donation_import_donors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references donation_import_batches (id) on delete cascade,
  -- finance_name_key del nombre ('' = filas sin nombre).
  match_key text not null,
  display_name text not null,
  family text,
  row_count int not null default 0,
  total_cents bigint not null default 0,
  candidate_person_ids uuid[] not null default '{}',
  suggested_person_id uuid references people (id) on delete set null,
  suggest_anonymous boolean not null default false,
  -- Otros donantes de este archivo con nombre parecido ("María Rivera" /
  -- "María Rivera López"): posible misma persona escrita distinto.
  similar_donor_ids uuid[] not null default '{}',
  decision text not null default 'pendiente'
    check (decision in ('pendiente', 'enlazar', 'crear', 'anonima', 'omitir', 'unir')),
  -- 'unir': sus filas van con las de este otro donante del mismo archivo.
  same_as_donor_id uuid references donation_import_donors (id) on delete set null,
  person_id uuid references people (id) on delete set null,
  new_first_name text check (new_first_name is null or char_length(new_first_name) between 1 and 100),
  new_last_name text check (new_last_name is null or char_length(new_last_name) <= 100),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  unique (batch_id, match_key),
  check (decision <> 'enlazar' or person_id is not null),
  check (decision <> 'crear' or new_first_name is not null),
  check ((decision = 'unir') = (same_as_donor_id is not null))
);

create table donation_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references donation_import_batches (id) on delete cascade,
  donor_id uuid not null references donation_import_donors (id) on delete cascade,
  row_number int not null,
  raw jsonb not null,
  donation_date date,
  amount_cents bigint,
  raw_type text,
  donation_type donation_type,
  raw_method text,
  payment_method donation_payment_method,
  reference text,
  subcategory text,
  notes text,
  -- Errores que impiden importar la fila (fecha, monto, referencia).
  errors text[] not null default '{}',
  status text not null default 'pendiente'
    check (status in ('pendiente', 'importada', 'omitida', 'posible_repetida')),
  status_detail text,
  allow_repeat boolean not null default false,
  donation_id uuid references donations (id),
  unique (batch_id, row_number)
);

comment on table donation_import_rows is
  'Fila de un archivo de donaciones. Nunca va directo a donations: se '
  'promueve con finance_import_promote() tras decidir cada donante. '
  'id = idempotency_key de la donación creada (reintentos seguros).';

create index donation_import_donors_batch_idx on donation_import_donors (batch_id);
create index donation_import_donors_key_idx on donation_import_donors (match_key) where person_id is not null;
create index donation_import_rows_batch_idx on donation_import_rows (batch_id, status);
create index donation_import_rows_donor_idx on donation_import_rows (donor_id);
create index donation_import_rows_donation_idx on donation_import_rows (donation_id) where donation_id is not null;

alter table donation_import_batches enable row level security;
alter table donation_import_donors enable row level security;
alter table donation_import_rows enable row level security;

create policy donation_import_batches_select_finance on donation_import_batches
  for select using (has_finance_access());
create policy donation_import_donors_select_finance on donation_import_donors
  for select using (has_finance_access());
create policy donation_import_rows_select_finance on donation_import_rows
  for select using (has_finance_access());
-- Sin políticas de escritura: solo las funciones de abajo.

-- Descartar sugerencias de vínculo que no son la misma persona.
create table finance_link_dismissals (
  donor_id uuid not null references people (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  dismissed_by uuid references auth.users (id) on delete set null,
  dismissed_at timestamptz not null default now(),
  primary key (donor_id, person_id)
);

alter table finance_link_dismissals enable row level security;
create policy finance_link_dismissals_select_finance on finance_link_dismissals
  for select using (has_finance_access());

-- ---------------------------------------------------------------------
-- 5. Crear el lote (las filas ya vienen interpretadas por el servidor;
--    aquí se vuelve a validar lo que importa para la base).
-- ---------------------------------------------------------------------

create or replace function finance_import_lock_batch(p_batch_id uuid)
returns donation_import_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v donation_import_batches%rowtype;
begin
  perform finance_require_access();
  select * into v from donation_import_batches where id = p_batch_id for update;
  if not found then
    raise exception 'NO_ENCONTRADA: No se encontró el lote.';
  end if;
  if v.status <> 'en_revision' then
    raise exception 'ESTADO: Este lote ya no está en revisión.';
  end if;
  return v;
end;
$$;

revoke all on function finance_import_lock_batch(uuid) from public, anon, authenticated;

create or replace function finance_import_create_batch(p_file_name text, p_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
  v_count int;
  r jsonb;
  v_name text;
  v_key text;
  v_donor uuid;
  v_errors text[];
  v_date date;
  v_amount bigint;
  v_ref text;
  v_prior uuid;
  v_cands uuid[];
  v_exact uuid[];
begin
  perform finance_require_access();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'DATOS_INVALIDOS: Archivo inválido.';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count = 0 then
    raise exception 'DATOS_INVALIDOS: El archivo no tiene filas.';
  end if;
  if v_count > 20000 then
    raise exception 'DATOS_INVALIDOS: Máximo 20,000 filas por archivo.';
  end if;

  insert into donation_import_batches (file_name, total_rows, created_by)
  values (left(coalesce(nullif(btrim(p_file_name), ''), 'archivo.csv'), 200), v_count, auth.uid())
  returning id into v_batch;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_name := btrim(regexp_replace(coalesce(r ->> 'donor_name', ''), '\s+', ' ', 'g'));
    if v_name = '' then
      v_name := btrim(regexp_replace(coalesce(r ->> 'family', ''), '\s+', ' ', 'g'));
    end if;
    v_name := left(v_name, 150);
    v_key := finance_name_key(v_name);

    v_errors := coalesce(array(select jsonb_array_elements_text(coalesce(r -> 'errors', '[]'))), '{}');
    v_date := case when (r ->> 'donation_date') ~ '^\d{4}-\d{2}-\d{2}$'
                   then (r ->> 'donation_date')::date end;
    v_amount := case when (r ->> 'amount_cents') ~ '^\d{1,12}$'
                     then (r ->> 'amount_cents')::bigint end;
    v_ref := nullif(btrim(coalesce(r ->> 'reference', '')), '');

    if v_date is null then
      if cardinality(v_errors) = 0 then v_errors := array_append(v_errors, 'Fecha inválida.'); end if;
    elsif v_date < date '2000-01-01' or v_date > finance_today() then
      v_errors := array_append(v_errors, 'La fecha no puede ser futura ni anterior al 2000.');
      v_date := null;
    end if;
    if v_amount is null or v_amount <= 0 or v_amount > 100000000 then
      if cardinality(v_errors) = 0 then
        v_errors := array_append(v_errors, 'Monto inválido (mayor que $0.00 y hasta $1,000,000.00).');
      end if;
      v_amount := null;
    end if;
    if v_ref is not null and (char_length(v_ref) > 80
        or regexp_replace(v_ref, '[\s-]', '', 'g') ~ '\d{13,}') then
      v_errors := array_append(v_errors, 'Referencia inválida (máx. 80 caracteres, sin números de tarjeta).');
      v_ref := null;
    end if;

    insert into donation_import_donors (batch_id, match_key, display_name, family)
    values (v_batch, v_key, case when v_key = '' then 'Sin nombre' else v_name end,
            nullif(left(btrim(coalesce(r ->> 'family', '')), 150), ''))
    on conflict (batch_id, match_key) do update set match_key = excluded.match_key
    returning id into v_donor;

    insert into donation_import_rows (
      batch_id, donor_id, row_number, raw, donation_date, amount_cents,
      raw_type, donation_type, raw_method, payment_method, reference,
      subcategory, notes, errors, status, status_detail
    ) values (
      v_batch, v_donor, (r ->> 'row_number')::int, coalesce(r -> 'raw', '{}'), v_date, v_amount,
      left(r ->> 'raw_type', 80),
      case when r ->> 'donation_type' in ('diezmo', 'ofrenda', 'semilla', 'primicias', 'pacto')
           then (r ->> 'donation_type')::donation_type end,
      left(r ->> 'raw_method', 80),
      case when r ->> 'payment_method' in ('efectivo', 'ath', 'credito', 'ath_movil', 'cheque', 'giro')
           then (r ->> 'payment_method')::donation_payment_method end,
      v_ref,
      nullif(left(btrim(coalesce(r ->> 'subcategory', '')), 120), ''),
      nullif(left(btrim(coalesce(r ->> 'notes', '')), 500), ''),
      v_errors,
      case when cardinality(v_errors) > 0 then 'omitida' else 'pendiente' end,
      case when cardinality(v_errors) > 0 then array_to_string(v_errors, ' ') end
    );
  end loop;

  update donation_import_donors d
     set row_count = s.n, total_cents = s.total
    from (
      select donor_id, count(*) as n,
             coalesce(sum(amount_cents) filter (where cardinality(errors) = 0), 0) as total
        from donation_import_rows where batch_id = v_batch group by donor_id
    ) s
   where s.donor_id = d.id;

  -- Sugerencias: primero el enlace usado en lotes anteriores con el mismo
  -- nombre, luego coincidencias por nombre. Nada queda decidido.
  for v_donor, v_key in
    select id, match_key from donation_import_donors where batch_id = v_batch
  loop
    if v_key = '' or v_key ~ '^(anonim[oa]s?|sin nombre|n a|na|ninguno|general|ofrenda general|ofrendas? generales?|colecta|varios)$' then
      update donation_import_donors set suggest_anonymous = true where id = v_donor;
      continue;
    end if;

    select pd.person_id into v_prior
      from donation_import_donors pd
      join donation_import_batches b on b.id = pd.batch_id
      join people p on p.id = pd.person_id
     where pd.match_key = v_key and pd.batch_id <> v_batch and b.status = 'completado'
     order by b.completed_at desc
     limit 1;

    select coalesce(array_agg(c.person_id), '{}'),
           coalesce(array_agg(c.person_id) filter (where c.exact), '{}')
      into v_cands, v_exact
      from finance_name_candidates(v_key, true) c;

    if v_prior is not null and not (v_prior = any(v_cands)) then
      v_cands := v_prior || v_cands;
    end if;

    update donation_import_donors
       set candidate_person_ids = v_cands,
           suggested_person_id = coalesce(v_prior, case when cardinality(v_exact) = 1 then v_exact[1] end)
     where id = v_donor;
  end loop;

  update donation_import_donors d
     set similar_donor_ids = coalesce((
       select array_agg(o.id order by o.display_name)
         from donation_import_donors o
        where o.batch_id = d.batch_id and o.id <> d.id and o.match_key <> ''
          and (
            (cardinality(string_to_array(d.match_key, ' ')) >= 2
             and string_to_array(d.match_key, ' ') <@ string_to_array(o.match_key, ' '))
            or (cardinality(string_to_array(o.match_key, ' ')) >= 2
             and string_to_array(o.match_key, ' ') <@ string_to_array(d.match_key, ' '))
          )
     ), '{}')
   where d.batch_id = v_batch and d.match_key <> '';

  perform finance_log('importar_donaciones.crear_lote', 'donation_import_batches', v_batch,
                      jsonb_build_object('filas', v_count));
  return v_batch;
end;
$$;

revoke all on function finance_import_create_batch(text, jsonb) from public, anon;
grant execute on function finance_import_create_batch(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Decisiones por donante
-- ---------------------------------------------------------------------

create or replace function finance_import_decide(
  p_donor_id uuid,
  p_decision text,
  p_person_id uuid default null,
  p_first_name text default null,
  p_last_name text default null,
  p_same_as_donor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d donation_import_donors%rowtype;
  v_t donation_import_donors%rowtype;
  v_first text := btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g'));
  v_last text := btrim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g'));
begin
  perform finance_require_access();
  select * into v_d from donation_import_donors where id = p_donor_id for update;
  if not found then
    raise exception 'NO_ENCONTRADA: No se encontró el donante.';
  end if;
  perform finance_import_lock_batch(v_d.batch_id);

  if exists (select 1 from donation_import_rows where donor_id = p_donor_id and status = 'importada')
     or (v_d.decision = 'crear' and v_d.person_id is not null) then
    raise exception 'YA_IMPORTADO: Las donaciones de este donante ya se importaron; corrígelas desde Donaciones.';
  end if;
  if p_decision not in ('pendiente', 'enlazar', 'crear', 'anonima', 'omitir', 'unir') then
    raise exception 'DATOS_INVALIDOS: Decisión inválida.';
  end if;
  if p_decision = 'enlazar' and (p_person_id is null
      or not exists (select 1 from people where id = p_person_id)) then
    raise exception 'DATOS_INVALIDOS: Elige la persona.';
  end if;
  if p_decision = 'crear' and (v_first = '' or char_length(v_first) > 100 or char_length(v_last) > 100) then
    raise exception 'DATOS_INVALIDOS: Escribe el nombre del donante (máx. 100 caracteres).';
  end if;
  if p_decision = 'unir' then
    select * into v_t from donation_import_donors where id = p_same_as_donor_id;
    if not found or v_t.batch_id <> v_d.batch_id or v_t.id = v_d.id then
      raise exception 'DATOS_INVALIDOS: Elige otro donante de este mismo archivo.';
    end if;
    if v_t.decision = 'unir' then
      raise exception 'DATOS_INVALIDOS: Ese donante ya está unido a otro; únelo directamente a aquel.';
    end if;
  end if;
  -- Si otros se unieron a este, no puede a su vez unirse a un tercero.
  if p_decision = 'unir' and exists (
    select 1 from donation_import_donors where same_as_donor_id = p_donor_id
  ) then
    raise exception 'DATOS_INVALIDOS: Otros donantes están unidos a este; elige este como el principal.';
  end if;

  update donation_import_donors set
    decision = p_decision,
    person_id = case when p_decision = 'enlazar' then p_person_id end,
    same_as_donor_id = case when p_decision = 'unir' then p_same_as_donor_id end,
    new_first_name = case when p_decision = 'crear' then v_first end,
    new_last_name = case when p_decision = 'crear' then v_last end,
    decided_by = case when p_decision <> 'pendiente' then auth.uid() end,
    decided_at = case when p_decision <> 'pendiente' then now() end
  where id = p_donor_id;
end;
$$;

revoke all on function finance_import_decide(uuid, text, uuid, text, text, uuid) from public, anon;
grant execute on function finance_import_decide(uuid, text, uuid, text, text, uuid) to authenticated;

-- Acciones en bloque (cada clic es la confirmación humana):
--  'sugerencias': acepta el enlace sugerido (mismo nombre exacto o el
--                 usado en lotes anteriores) y las anónimas sugeridas.
--  'crear_sin_coincidencia': crea como donante de Finanzas a quienes no
--                 se parecen a nadie (con candidatos → revisión manual).
create or replace function finance_import_bulk_decide(p_batch_id uuid, p_action text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform finance_import_lock_batch(p_batch_id);
  if p_action = 'sugerencias' then
    update donation_import_donors set
      decision = case when suggest_anonymous then 'anonima' else 'enlazar' end,
      person_id = case when suggest_anonymous then null else suggested_person_id end,
      decided_by = auth.uid(), decided_at = now()
    where batch_id = p_batch_id and decision = 'pendiente'
      and (suggest_anonymous or suggested_person_id is not null);
  elsif p_action = 'crear_sin_coincidencia' then
    update donation_import_donors d set
      decision = 'crear',
      new_first_name = (finance_split_name(d.display_name)).first_name,
      new_last_name = (finance_split_name(d.display_name)).last_name,
      decided_by = auth.uid(), decided_at = now()
    where d.batch_id = p_batch_id and d.decision = 'pendiente'
      and not d.suggest_anonymous and d.match_key <> ''
      and cardinality(d.candidate_person_ids) = 0
      and cardinality(d.similar_donor_ids) = 0;
  else
    raise exception 'DATOS_INVALIDOS: Acción inválida.';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function finance_import_bulk_decide(uuid, text) from public, anon;
grant execute on function finance_import_bulk_decide(uuid, text) to authenticated;

-- Valores de Categoría / Forma de pago que el servidor no reconoció.
create or replace function finance_import_unmapped(p_batch_id uuid)
returns table (field text, raw_value text, row_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query
    select 'tipo'::text, coalesce(r.raw_type, ''), count(*)
      from donation_import_rows r
     where r.batch_id = p_batch_id and r.status = 'pendiente' and r.donation_type is null
     group by 2
    union all
    select 'forma'::text, coalesce(r.raw_method, ''), count(*)
      from donation_import_rows r
     where r.batch_id = p_batch_id and r.status = 'pendiente' and r.payment_method is null
     group by 2
    order by 1, 3 desc;
end;
$$;

revoke all on function finance_import_unmapped(uuid) from public, anon;
grant execute on function finance_import_unmapped(uuid) to authenticated;

create or replace function finance_import_map_value(
  p_batch_id uuid,
  p_field text,
  p_raw text,
  p_value text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform finance_import_lock_batch(p_batch_id);
  if p_field = 'tipo' and p_value in ('diezmo', 'ofrenda', 'semilla', 'primicias', 'pacto') then
    update donation_import_rows set donation_type = p_value::donation_type
     where batch_id = p_batch_id and status = 'pendiente'
       and lower(btrim(coalesce(raw_type, ''))) = lower(btrim(coalesce(p_raw, '')));
  elsif p_field = 'forma' and p_value in ('efectivo', 'ath', 'credito', 'ath_movil', 'cheque', 'giro') then
    update donation_import_rows set payment_method = p_value::donation_payment_method
     where batch_id = p_batch_id and status = 'pendiente'
       and lower(btrim(coalesce(raw_method, ''))) = lower(btrim(coalesce(p_raw, '')));
  else
    raise exception 'DATOS_INVALIDOS: Valor inválido.';
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function finance_import_map_value(uuid, text, text, text) from public, anon;
grant execute on function finance_import_map_value(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Importar (por tandas: cada llamada procesa hasta p_limit filas para
--    no pasar el tiempo máximo de una consulta; el servidor la repite).
-- ---------------------------------------------------------------------

create or replace function finance_import_promote(p_batch_id uuid, p_limit int default 250)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d donation_import_donors%rowtype;
  v_r record;
  v_person uuid;
  v_res jsonb;
  n_imp int := 0;
  n_skip int := 0;
  n_rep int := 0;
  v_remaining int;
  v_review int;
begin
  perform finance_import_lock_batch(p_batch_id);

  if exists (select 1 from donation_import_donors where batch_id = p_batch_id and decision = 'pendiente') then
    raise exception 'PENDIENTE: Faltan donantes por decidir.';
  end if;
  if exists (
    select 1 from donation_import_rows r
      join donation_import_donors d on d.id = r.donor_id
      left join donation_import_donors t on t.id = d.same_as_donor_id
     where r.batch_id = p_batch_id and r.status = 'pendiente'
       and coalesce(t.decision, d.decision) <> 'omitir'
       and (r.donation_type is null or r.payment_method is null)
  ) then
    raise exception 'PENDIENTE: Hay valores de Categoría o Forma de pago sin asignar.';
  end if;

  -- Donantes nuevos (solo si tienen algo que importar).
  for v_d in
    select * from donation_import_donors d
     where d.batch_id = p_batch_id and d.decision = 'crear' and d.person_id is null
       and exists (
         select 1 from donation_import_rows r
          where r.status = 'pendiente'
            and (r.donor_id = d.id or r.donor_id in (
                  select u.id from donation_import_donors u where u.same_as_donor_id = d.id)))
     for update
  loop
    insert into people (first_name, last_name, source, finance_only, created_by, updated_by)
    values (v_d.new_first_name, coalesce(v_d.new_last_name, ''), 'finanzas', true, auth.uid(), auth.uid())
    returning id into v_person;
    update donation_import_donors set person_id = v_person where id = v_d.id;
  end loop;

  for v_r in
    select r.id, r.donation_date, r.amount_cents, r.donation_type, r.payment_method,
           r.reference, r.allow_repeat,
           coalesce(t.decision, d.decision) as decision,
           coalesce(t.person_id, d.person_id) as person_id
      from donation_import_rows r
      join donation_import_donors d on d.id = r.donor_id
      left join donation_import_donors t on t.id = d.same_as_donor_id
     where r.batch_id = p_batch_id and r.status = 'pendiente'
     order by r.row_number
     limit greatest(1, least(coalesce(p_limit, 250), 500))
  loop
    if v_r.decision = 'omitir' then
      update donation_import_rows set status = 'omitida', status_detail = 'Donante omitido.'
       where id = v_r.id;
      n_skip := n_skip + 1;
      continue;
    end if;

    -- ¿Ya estaba registrada (a mano o en otro lote)? Las iguales dentro
    -- de este mismo archivo sí se importan (dos sobres iguales son válidos).
    if not v_r.allow_repeat and exists (
      select 1 from donations dn
       where dn.status = 'vigente' and dn.donation_date = v_r.donation_date
         and dn.amount_cents = v_r.amount_cents and dn.donation_type = v_r.donation_type
         and (case when v_r.decision = 'anonima' then dn.is_anonymous
                   else dn.person_id = v_r.person_id end)
         and not exists (select 1 from donation_import_rows x
                          where x.donation_id = dn.id and x.batch_id = p_batch_id)
    ) then
      update donation_import_rows
         set status = 'posible_repetida',
             status_detail = 'Ya hay una donación igual (persona, fecha, monto y tipo).'
       where id = v_r.id;
      n_rep := n_rep + 1;
      continue;
    end if;

    begin
      v_res := create_donation(
        v_r.id,
        case when v_r.decision = 'anonima' then null else v_r.person_id end,
        v_r.decision = 'anonima',
        v_r.donation_date, v_r.amount_cents, v_r.donation_type, v_r.payment_method,
        v_r.reference, null, false, false
      );
      update donation_import_rows
         set status = 'importada', status_detail = null, donation_id = (v_res ->> 'id')::uuid
       where id = v_r.id;
      n_imp := n_imp + 1;
    exception when others then
      update donation_import_rows
         set status = 'omitida', status_detail = left(regexp_replace(sqlerrm, '^[A-Z_]+: ', ''), 200)
       where id = v_r.id;
      n_skip := n_skip + 1;
    end;
  end loop;

  select count(*) filter (where status = 'pendiente'), count(*) filter (where status = 'posible_repetida')
    into v_remaining, v_review
    from donation_import_rows where batch_id = p_batch_id;

  update donation_import_batches
     set imported_count = (select count(*) from donation_import_rows
                            where batch_id = p_batch_id and status = 'importada')
   where id = p_batch_id;

  if v_remaining = 0 and v_review = 0 then
    update donation_import_batches set status = 'completado', completed_at = now()
     where id = p_batch_id;
    perform finance_log('importar_donaciones.completar', 'donation_import_batches', p_batch_id,
      jsonb_build_object('importadas', (select imported_count from donation_import_batches where id = p_batch_id)));
  end if;

  return jsonb_build_object('imported', n_imp, 'skipped', n_skip, 'repeated', n_rep,
                            'remaining', v_remaining, 'review', v_review);
end;
$$;

revoke all on function finance_import_promote(uuid, int) from public, anon;
grant execute on function finance_import_promote(uuid, int) to authenticated;

-- Posibles repetidas: incluir de todos modos (vuelve a "pendiente") u omitir.
-- p_row_id null = todas las del lote.
create or replace function finance_import_resolve_repeats(p_batch_id uuid, p_row_id uuid, p_include boolean)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  perform finance_import_lock_batch(p_batch_id);
  update donation_import_rows set
    status = case when p_include then 'pendiente' else 'omitida' end,
    allow_repeat = coalesce(p_include, false),
    status_detail = case when p_include then null else 'Omitida: ya estaba registrada.' end
  where batch_id = p_batch_id and status = 'posible_repetida'
    and (p_row_id is null or id = p_row_id);
  get diagnostics n = row_count;

  if not exists (select 1 from donation_import_rows
                  where batch_id = p_batch_id and status in ('pendiente', 'posible_repetida'))
     and exists (select 1 from donation_import_rows where batch_id = p_batch_id and status = 'importada') then
    update donation_import_batches set status = 'completado', completed_at = now()
     where id = p_batch_id;
  end if;
  return n;
end;
$$;

revoke all on function finance_import_resolve_repeats(uuid, uuid, boolean) from public, anon;
grant execute on function finance_import_resolve_repeats(uuid, uuid, boolean) to authenticated;

create or replace function finance_import_discard(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform finance_import_lock_batch(p_batch_id);
  if exists (select 1 from donation_import_rows where batch_id = p_batch_id and status = 'importada') then
    raise exception 'ESTADO: Ya se importaron donaciones de este lote; no se puede descartar.';
  end if;
  update donation_import_batches set status = 'descartado' where id = p_batch_id;
  perform finance_log('importar_donaciones.descartar', 'donation_import_batches', p_batch_id, '{}');
end;
$$;

revoke all on function finance_import_discard(uuid) from public, anon;
grant execute on function finance_import_discard(uuid) to authenticated;

-- Pantalla de revisión: donantes con nombres de sus candidatos (Finanzas
-- no lee `people` directo).
create or replace function finance_import_donor_list(p_batch_id uuid)
returns table (
  id uuid,
  display_name text,
  family text,
  row_count int,
  total_cents bigint,
  decision text,
  person_id uuid,
  person_name text,
  same_as_donor_id uuid,
  same_as_name text,
  new_first_name text,
  new_last_name text,
  suggest_anonymous boolean,
  suggested_person_id uuid,
  candidates jsonb,
  similar jsonb,
  imported_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query
    select d.id, d.display_name, d.family, d.row_count, d.total_cents, d.decision, d.person_id,
      (select p.first_name || ' ' || p.last_name from people p where p.id = d.person_id),
      d.same_as_donor_id,
      (select t.display_name from donation_import_donors t where t.id = d.same_as_donor_id),
      d.new_first_name, d.new_last_name, d.suggest_anonymous, d.suggested_person_id,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'name', p.first_name || ' ' || p.last_name,
          'finance_only', p.finance_only,
          'has_account', exists (select 1 from profiles pr where pr.person_id = p.id),
          'hint', case
            when length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 4 then
              'Tel. termina en ' || right(regexp_replace(p.phone, '\D', '', 'g'), 4)
            when p.email is not null then
              left(p.email::text, 1) || '•••@' || split_part(p.email::text, '@', 2)
            else null
          end
        ) order by array_position(d.candidate_person_ids, p.id))
        from people p where p.id = any(d.candidate_person_ids)
      ), '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.display_name,
                                            'decision', o.decision) order by o.display_name)
        from donation_import_donors o where o.id = any(d.similar_donor_ids)
      ), '[]'::jsonb),
      (select count(*) from donation_import_rows r where r.donor_id = d.id and r.status = 'importada')
    from donation_import_donors d
    where d.batch_id = p_batch_id
    order by (d.decision = 'pendiente') desc, d.display_name;
end;
$$;

revoke all on function finance_import_donor_list(uuid) from public, anon;
grant execute on function finance_import_donor_list(uuid) to authenticated;

create or replace function finance_import_summary(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return (
    select jsonb_build_object(
      'rows', count(*),
      'with_errors', count(*) filter (where cardinality(r.errors) > 0),
      'pending', count(*) filter (where r.status = 'pendiente'),
      'imported', count(*) filter (where r.status = 'importada'),
      'skipped', count(*) filter (where r.status = 'omitida'),
      'repeated', count(*) filter (where r.status = 'posible_repetida'),
      'valid_cents', coalesce(sum(r.amount_cents) filter (where cardinality(r.errors) = 0), 0),
      'imported_cents', coalesce(sum(r.amount_cents) filter (where r.status = 'importada'), 0),
      'donors', (select count(*) from donation_import_donors d where d.batch_id = p_batch_id),
      'donors_pending', (select count(*) from donation_import_donors d
                          where d.batch_id = p_batch_id and d.decision = 'pendiente'),
      'donors_suggested', (select count(*) from donation_import_donors d
                            where d.batch_id = p_batch_id and d.decision = 'pendiente'
                              and (d.suggest_anonymous or d.suggested_person_id is not null)),
      'donors_no_match', (select count(*) from donation_import_donors d
                           where d.batch_id = p_batch_id and d.decision = 'pendiente'
                             and not d.suggest_anonymous and d.match_key <> ''
                             and cardinality(d.candidate_person_ids) = 0
                             and cardinality(d.similar_donor_ids) = 0)
    )
    from donation_import_rows r where r.batch_id = p_batch_id
  );
end;
$$;

revoke all on function finance_import_summary(uuid) from public, anon;
grant execute on function finance_import_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Vincular un donante de Finanzas con la persona real del directorio
-- ---------------------------------------------------------------------

create or replace function finance_link_donor(p_donor_id uuid, p_person_id uuid, p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donor people%rowtype;
  v_had boolean;
  v_old donations%rowtype;
  v_new donations%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  n int := 0;
  v_date date;
begin
  perform finance_require_access();
  if char_length(v_reason) < 5 then
    raise exception 'DATOS_INVALIDOS: Escribe el motivo (mínimo 5 caracteres).';
  end if;
  select * into v_donor from people where id = p_donor_id for update;
  if not found or not v_donor.finance_only then
    raise exception 'DATOS_INVALIDOS: Solo se puede vincular un donante de Finanzas.';
  end if;
  if p_person_id is null or p_person_id = p_donor_id
     or not exists (select 1 from people where id = p_person_id and not finance_only) then
    raise exception 'DATOS_INVALIDOS: Elige una persona del directorio.';
  end if;

  v_had := exists (select 1 from donations where person_id = p_person_id);

  for v_old in select * from donations where person_id = p_donor_id order by donation_date for update loop
    update donations set person_id = p_person_id, version = version + 1,
                         updated_at = now(), updated_by = auth.uid()
     where id = v_old.id
     returning * into v_new;
    insert into donation_revisions (donation_id, revision, action, before, after, reason, actor_user_id)
    values (v_old.id, v_new.version, 'corregida', donation_row_json(v_old), donation_row_json(v_new),
            'Donante vinculado a la persona del directorio: ' || v_reason, auth.uid());
    n := n + 1;
  end loop;

  -- Las cartas pasan a la persona; si ya tenía una del mismo período, la
  -- movida toma el siguiente número de versión.
  update donation_letters l
     set person_id = p_person_id,
         version = l.version + coalesce((
           select max(t.version) from donation_letters t
            where t.person_id = p_person_id and t.period_start = l.period_start
              and t.period_end = l.period_end), 0)
   where l.person_id = p_donor_id;

  -- Si la persona ya tenía donaciones, sus totales cambian: las cartas
  -- de esos períodos se marcan para revisión.
  if v_had then
    for v_date in select distinct donation_date from donations where person_id = p_person_id loop
      perform flag_letters_for_review(p_person_id, v_date,
        'Se vincularon a esta persona donaciones de otro registro.');
    end loop;
  end if;

  update donation_import_donors set person_id = p_person_id where person_id = p_donor_id;
  delete from people where id = p_donor_id;

  perform finance_log('vincular_donante', 'people', p_person_id,
    jsonb_build_object('donante_anterior', p_donor_id, 'donaciones', n, 'motivo', v_reason));
  return n;
end;
$$;

revoke all on function finance_link_donor(uuid, uuid, text) from public, anon;
grant execute on function finance_link_donor(uuid, uuid, text) to authenticated;

-- Donantes de Finanzas que se parecen a alguien del directorio (por
-- ejemplo, porque se registró en la app). Solo sugerencias.
create or replace function finance_donor_link_suggestions()
returns table (
  donor_id uuid,
  donor_name text,
  donation_count bigint,
  person_id uuid,
  person_name text,
  hint text,
  has_account boolean,
  exact boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query
    select dp.id, dp.first_name || ' ' || dp.last_name,
      (select count(*) from donations dn where dn.person_id = dp.id),
      p.id, p.first_name || ' ' || p.last_name,
      case
        when length(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g')) >= 4 then
          'Tel. termina en ' || right(regexp_replace(p.phone, '\D', '', 'g'), 4)
        when p.email is not null then left(p.email::text, 1) || '•••@' || split_part(p.email::text, '@', 2)
        else null
      end,
      exists (select 1 from profiles pr where pr.person_id = p.id),
      c.exact
    from people dp
    cross join lateral finance_name_candidates(
      finance_name_key(dp.first_name || ' ' || dp.last_name), false) c
    join people p on p.id = c.person_id
    where dp.finance_only
      and not exists (select 1 from finance_link_dismissals x
                       where x.donor_id = dp.id and x.person_id = p.id)
    order by c.exact desc, 7 desc, 2, 5;
end;
$$;

revoke all on function finance_donor_link_suggestions() from public, anon;
grant execute on function finance_donor_link_suggestions() to authenticated;

create or replace function finance_dismiss_link_suggestion(p_donor_id uuid, p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  insert into finance_link_dismissals (donor_id, person_id, dismissed_by)
  values (p_donor_id, p_person_id, auth.uid())
  on conflict do nothing;
end;
$$;

revoke all on function finance_dismiss_link_suggestion(uuid, uuid) from public, anon;
grant execute on function finance_dismiss_link_suggestion(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Selectores e inscripción: no listan donantes de Finanzas (son
--    security definer y no pasan por RLS). Copias de su última versión
--    (0019, 0032, 0045, 0041) con `people` → personas del directorio.
-- ---------------------------------------------------------------------

create or replace function list_people_for_ministry_picker()
returns table (id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name
  from (select * from people where not finance_only) p
  where is_staff()
     or exists (
       select 1
       from ministries m
       where m.leader_person_id = current_person_id()
     )
     or exists (
       select 1
       from ministry_memberships mm
       where mm.person_id = current_person_id()
         and mm.role_in_ministry in ('lider', 'colider')
         and mm.left_at is null
     )
  order by p.last_name, p.first_name;
$$;

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
    from (select * from people where not finance_only) p
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

create or replace function list_people_for_class_enrollment(p_class_offering_id uuid)
returns table (id uuid, first_name text, last_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    has_any_role(array['administrador', 'coordinador_ministerio', 'seguimiento']::app_role[])
    or exists (
      select 1 from class_offerings co
       where co.id = p_class_offering_id
         and co.teacher_person_id = current_person_id()
         and (has_role('maestro') or has_role('pastor'))
    )
  ) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return query
    select p.id, p.first_name, p.last_name
      from (select * from people where not finance_only) p
     order by p.last_name, p.first_name, p.id;
end;
$$;

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
        from (select * from people where not finance_only) p
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

notify pgrst, 'reload schema';
