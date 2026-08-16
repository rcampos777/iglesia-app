-- Permite que un miembro actualice su propia información de contacto
-- desde el portal, sin abrir una política RLS de UPDATE genérica sobre
-- `people` (que sería difícil de acotar a columnas específicas con RLS
-- puro). RLS es por fila, no por columna; una función SECURITY DEFINER
-- con parámetros explícitos es el mecanismo recomendado por Postgres/
-- Supabase para "solo estas columnas, solo tu propia fila".

create or replace function update_own_contact_info(
  p_phone text default null,
  p_email text default null,
  p_address_line text default null,
  p_city text default null,
  p_preferred_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  v_person_id := current_person_id();

  if v_person_id is null then
    raise exception 'No tienes un perfil de persona asociado.';
  end if;

  update people
  set
    phone = coalesce(p_phone, phone),
    email = coalesce(p_email, email),
    address_line = coalesce(p_address_line, address_line),
    city = coalesce(p_city, city),
    preferred_name = coalesce(p_preferred_name, preferred_name),
    updated_by = auth.uid()
  where id = v_person_id;
end;
$$;
