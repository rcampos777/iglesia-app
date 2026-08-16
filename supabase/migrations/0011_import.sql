-- Importación de datos (Excel/CSV/Access) y entrada manual masiva.
-- Regla dura: nunca se escribe directamente en tablas finales. Todo pasa
-- por staging (import_rows), se valida, y se promueve fila por fila tras
-- revisión humana. Ver docs/import-process.md.

create type import_source_type as enum ('excel', 'csv', 'access', 'manual');
create type import_batch_status as enum (
  'cargando', 'en_revision', 'aprobado_parcial', 'completado', 'descartado'
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type import_source_type not null,
  target_entity text not null default 'people',
  file_name text,
  status import_batch_status not null default 'cargando',
  total_rows integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);

create trigger import_batches_set_updated_at
  before update on import_batches
  for each row
  execute function moddatetime_updated_at();

alter table import_batches enable row level security;

create policy import_batches_all_staff on import_batches
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[])
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[])
  );

create type import_match_status as enum (
  'nuevo', 'posible_duplicado', 'duplicado_confirmado', 'invalido'
);
create type import_row_decision as enum (
  'pendiente', 'aprobar_nuevo', 'aprobar_fusion', 'rechazar'
);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches (id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null,
  normalized_data jsonb,
  match_status import_match_status not null default 'nuevo',
  matched_person_id uuid references people (id),
  candidate_person_ids uuid[] not null default '{}',
  validation_errors jsonb not null default '[]',
  decision import_row_decision not null default 'pendiente',
  promoted_person_id uuid references people (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  unique (batch_id, row_number)
);

create index import_rows_batch_idx on import_rows (batch_id);
create index import_rows_decision_idx on import_rows (decision);

alter table import_rows enable row level security;

create policy import_rows_all_staff on import_rows
  for all
  using (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[])
  )
  with check (
    has_any_role(array['administrador', 'pastor', 'coordinador_ministerio', 'seguimiento']::app_role[])
  );
