-- Bitácora general de auditoría para acciones administrativas sensibles
-- (cambios de rol, fusión de personas, eliminaciones, etc). Distinta del
-- log de acceso a peticiones de oración (más específico y estricto).

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_actor_idx on audit_log (actor_user_id);

alter table audit_log enable row level security;

create policy audit_log_select_admin on audit_log
  for select
  using (is_admin());

-- Solo se inserta vía función security definer desde la capa de datos
-- del servidor (nunca insert directo del cliente).
create policy audit_log_insert_none on audit_log
  for insert
  with check (false);

create or replace function log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_user_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
end;
$$;
