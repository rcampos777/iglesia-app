-- Corrige un bug real encontrado al probar 0018 en vivo con una sesión
-- de líder de ministerio sin rol de staff:
--
-- `is_ministry_leader()` le permitía leer las filas de
-- `ministry_memberships` de su ministerio, pero la RLS de `people` sigue
-- limitando a un no-staff a su propio registro. Resultado: el líder veía
-- su equipo como "? ?" / "sin contacto", y el selector para agregar
-- gente salía vacío ("todas las personas ya sirven aquí"). La función de
-- líder quedaba inservible.
--
-- Se resuelve con el mínimo acceso necesario, en dos piezas separadas:

-- 1) El líder puede leer el registro completo de las personas de SU
--    ministerio (las necesita para coordinarlas: nombre y contacto).
--    Incluye a quienes ya salieron, para que el histórico también se
--    muestre con nombre en vez de "? ?".
create policy people_select_ministry_leader on people
  for select
  using (
    exists (
      select 1
      from ministry_memberships mm
      where mm.person_id = people.id
        and is_ministry_leader(mm.ministry_id)
    )
  );

-- 2) Para AGREGAR a alguien, el líder necesita elegir del directorio,
--    pero no debe obtener acceso de lectura al directorio completo.
--    Esta función devuelve únicamente id + nombre (nunca email,
--    teléfono, dirección ni notas) y solo a staff o a quien lidere al
--    menos un ministerio. Mismo patrón acotado por columnas que
--    `update_own_contact_info()` (0015) y `list_users_with_roles()` (0016).
create or replace function list_people_for_ministry_picker()
returns table (id uuid, first_name text, last_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name
  from people p
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

revoke all on function list_people_for_ministry_picker() from public;
grant execute on function list_people_for_ministry_picker() to authenticated;
