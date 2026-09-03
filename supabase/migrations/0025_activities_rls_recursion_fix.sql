-- Corrige una recursión infinita en las políticas de 0024, encontrada al
-- abrir /actividades con una sesión real:
--
--   ERROR: infinite recursion detected in policy for relation "activities"
--
-- Causa: `activities_select` consultaba `activity_participants` (para
-- dejar que una persona vea las actividades en las que está inscrita), y
-- `activity_participants_select` consultaba `activities` (para dejar que
-- el líder del ministerio vea a los inscritos). Cada política disparaba
-- la evaluación de la otra: ciclo.
--
-- Se rompe el ciclo en AMBAS direcciones con funciones SECURITY DEFINER,
-- que corren como dueño de la tabla y por tanto no re-evalúan RLS —
-- mismo patrón que `is_ministry_leader()` en 0018.

create or replace function is_activity_participant(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from activity_participants ap
    where ap.activity_id = p_activity_id
      and ap.person_id = current_person_id()
  );
$$;

-- Devuelve el ministerio dueño de una actividad SIN pasar por la RLS de
-- `activities`, que es lo que cerraba el ciclo.
create or replace function activity_ministry_id(p_activity_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.ministry_id from activities a where a.id = p_activity_id;
$$;

drop policy activities_select on activities;
create policy activities_select on activities
  for select
  using (
    is_staff()
    or (ministry_id is not null and is_ministry_leader(ministry_id))
    or is_activity_participant(id)
  );

drop policy activity_participants_select on activity_participants;
create policy activity_participants_select on activity_participants
  for select
  using (
    is_staff()
    or person_id = current_person_id()
    or is_ministry_leader(activity_ministry_id(activity_id))
  );

drop policy activity_participants_write on activity_participants;
create policy activity_participants_write on activity_participants
  for all
  using (can_manage_activity(activity_ministry_id(activity_id)))
  with check (can_manage_activity(activity_ministry_id(activity_id)));

-- `is_ministry_leader(null)` devuelve false (los EXISTS no casan), así
-- que una actividad sin ministerio no queda expuesta por accidente.

-- Refresca la caché de esquema de PostgREST: si no, las funciones nuevas
-- tardan en quedar disponibles vía RPC.
notify pgrst, 'reload schema';
