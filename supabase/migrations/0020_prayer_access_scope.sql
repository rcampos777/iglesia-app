-- Cambio de regla de negocio pedido por el usuario (registrado en
-- docs/decisions.md y reflejado en CLAUDE.md §3.11):
--
--   ANTES: leían las peticiones de oración los roles intercesor, pastor
--          y administrador — cualquier pastor, globalmente.
--   AHORA: las leen el rol `intercesor`, el `administrador`, y el
--          "pastor de intercesión", entendido como el LÍDER del
--          ministerio de intercesión.
--
-- El ministerio de intercesión NO se identifica por su nombre (los
-- nombres cambian y no son identificadores — CLAUDE.md §3.3), sino con
-- un flag que el administrador marca desde la app.

alter table ministries
  add column grants_prayer_access boolean not null default false;

comment on column ministries.grants_prayer_access is
  'Si es true, los líderes (lider/colider) de este ministerio pueden leer '
  'las peticiones de oración. Permite designar el ministerio de '
  'intercesión sin codificar su nombre en el esquema.';

-- Un solo ministerio puede otorgar este acceso a la vez: evita que se
-- marquen varios por descuido y se filtre información confidencial.
create unique index ministries_single_prayer_access_idx
  on ministries ((grants_prayer_access))
  where grants_prayer_access;

create or replace function is_prayer_reader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['intercesor', 'administrador']::app_role[])
     or exists (
       select 1
       from ministries m
       where m.grants_prayer_access
         and m.is_active
         and m.leader_person_id is not null
         and m.leader_person_id = current_person_id()
     )
     or exists (
       select 1
       from ministry_memberships mm
       join ministries m on m.id = mm.ministry_id
       where m.grants_prayer_access
         and m.is_active
         and mm.person_id = current_person_id()
         and mm.role_in_ministry in ('lider', 'colider')
         and mm.left_at is null
     );
$$;

comment on function is_prayer_reader is
  'Quién puede leer peticiones de oración: rol intercesor, administrador, '
  'o líder del ministerio marcado con grants_prayer_access.';

-- Se reemplazan las políticas que nombraban al rol `pastor`.
drop policy prayer_requests_select on prayer_requests;
create policy prayer_requests_select on prayer_requests
  for select
  using (
    is_prayer_reader()
    or assigned_to = auth.uid()
    or submitted_by_user_id = auth.uid()
  );

drop policy prayer_requests_update on prayer_requests;
create policy prayer_requests_update on prayer_requests
  for update
  using (is_prayer_reader() or assigned_to = auth.uid())
  with check (is_prayer_reader() or assigned_to = auth.uid());

-- Borrar una petición pasa a ser exclusivo de `administrador`: is_admin()
-- incluye a `pastor`, que ya no debe tocar peticiones.
drop policy prayer_requests_delete_admin on prayer_requests;
create policy prayer_requests_delete_admin on prayer_requests
  for delete
  using (has_role('administrador'));

-- La bitácora de accesos también deja de ser visible para el pastor.
drop policy prayer_request_access_log_select_admin on prayer_request_access_log;
create policy prayer_request_access_log_select_admin on prayer_request_access_log
  for select
  using (has_role('administrador'));
