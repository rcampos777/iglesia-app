-- Certificaciones de ministros y servidores (antecedentes penales,
-- Registro de Ofensores Sexuales / Ley 300, credenciales...). La iglesia
-- debe tenerlas al día para quien trabaja con niños y jóvenes.
--
-- Decisiones (docs/decisions.md, 2026-10-01):
-- - Solo `apostol` (SuperAdmin) y `finanzas` las ven y gestionan, igual
--   que Finanzas: `administrador` NO. Reusa has_finance_access().
-- - Solo `apostol` borra un registro (los demás lo actualizan).
-- - Toda creación, cambio, borrado y apertura del archivo queda en
--   finance_audit_log (solo apostol la lee).
-- - Quien gestiona no necesita leer `people`: el listado sale de una
--   función que devuelve solo el nombre.
-- - El archivo vive en el bucket privado `certificaciones` (0043).

create table certification_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

insert into certification_types (name, description) values
  ('Certificado de Antecedentes Penales',
   'Expedido por la Policía de Puerto Rico.'),
  ('Certificación del Registro de Ofensores Sexuales (Ley 300)',
   'Requerida para quien trabaja con niños, jóvenes o personas con impedimentos.'),
  ('Credencial ministerial', null);

create table person_certifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  type_id uuid not null references certification_types (id),
  issued_on date,
  expires_on date,
  file_path text check (
    file_path is null
    or file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
  ),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint person_certifications_dates_check
    check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

create index person_certifications_person_idx on person_certifications (person_id);
create index person_certifications_expires_idx on person_certifications (expires_on);

create trigger person_certifications_set_updated_at
  before update on person_certifications
  for each row
  execute function moddatetime_updated_at();

alter table certification_types enable row level security;
alter table person_certifications enable row level security;

create policy certification_types_select on certification_types
  for select using (has_finance_access());
create policy certification_types_insert on certification_types
  for insert with check (has_finance_access());
create policy certification_types_update on certification_types
  for update using (has_finance_access()) with check (has_finance_access());

create policy person_certifications_select on person_certifications
  for select using (has_finance_access());
create policy person_certifications_insert on person_certifications
  for insert with check (has_finance_access());
create policy person_certifications_update on person_certifications
  for update using (has_finance_access()) with check (has_finance_access());
create policy person_certifications_delete on person_certifications
  for delete using (is_apostol());

-- ---------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------

create or replace function person_certifications_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row person_certifications%rowtype := case when tg_op = 'DELETE' then old else new end;
begin
  perform finance_log(
    case tg_op
      when 'INSERT' then 'certificacion.crear'
      when 'UPDATE' then 'certificacion.actualizar'
      else 'certificacion.borrar'
    end,
    'person_certification',
    v_row.id,
    jsonb_build_object(
      'person_id', v_row.person_id,
      'type_id', v_row.type_id,
      'expires_on', v_row.expires_on,
      'file_changed', tg_op = 'UPDATE' and new.file_path is distinct from old.file_path
    )
  );
  return null;
end;
$$;

create trigger person_certifications_audit
  after insert or update or delete on person_certifications
  for each row
  execute function person_certifications_audit();

-- Abrir el archivo se registra antes de firmar la URL.
create or replace function certification_log_file_view(p_certification_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
begin
  perform finance_require_access();
  select file_path into v_path from person_certifications where id = p_certification_id;
  if v_path is null then
    raise exception 'Esta certificación no tiene archivo.';
  end if;
  perform finance_log('certificacion.ver_archivo', 'person_certification', p_certification_id, '{}');
  return v_path;
end;
$$;

revoke all on function certification_log_file_view(uuid) from public, anon;
grant execute on function certification_log_file_view(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Listado con el nombre de la persona (quien gestiona no lee `people`).
-- ---------------------------------------------------------------------

create or replace function certifications_list(p_person_id uuid default null)
returns table (
  id uuid,
  person_id uuid,
  person_name text,
  type_id uuid,
  type_name text,
  issued_on date,
  expires_on date,
  has_file boolean,
  file_name text,
  notes text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform finance_require_access();
  return query
    select c.id, c.person_id, p.first_name || ' ' || p.last_name, c.type_id, t.name,
           c.issued_on, c.expires_on, c.file_path is not null, c.file_name, c.notes, c.updated_at
      from person_certifications c
      join people p on p.id = c.person_id
      join certification_types t on t.id = c.type_id
     where p_person_id is null or c.person_id = p_person_id
     order by c.expires_on nulls last, p.last_name, p.first_name;
end;
$$;

revoke all on function certifications_list(uuid) from public, anon;
grant execute on function certifications_list(uuid) to authenticated;

notify pgrst, 'reload schema';
