-- Forma de contacto del sitio público (2026-10-21, docs/site.md).
-- El público no escribe en la tabla: el servidor de la app llama
-- submit_site_contact() con service_role después de la trampa anti-spam
-- y el CAPTCHA (mismo patrón que la inscripción, 0048).
-- Leen y gestionan: administrador y seguimiento (y SuperAdmin por 0036).
-- `sitio_web` NO: ese rol no da acceso a datos personales.

create table site_contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  message text not null check (char_length(message) between 1 and 4000),
  status text not null default 'nuevo' check (status in ('nuevo', 'atendido')),
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create index site_contact_messages_created_idx on site_contact_messages (created_at desc);

create or replace function can_read_contact_messages()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['administrador', 'seguimiento']::app_role[]);
$$;

comment on function can_read_contact_messages is
  'Mensajes de la forma de contacto: administrador, seguimiento (y SuperAdmin por 0036).';

alter table site_contact_messages enable row level security;

create policy site_contact_select on site_contact_messages
  for select to authenticated using (can_read_contact_messages());

create policy site_contact_update on site_contact_messages
  for update to authenticated
  using (can_read_contact_messages())
  with check (can_read_contact_messages());

create policy site_contact_delete on site_contact_messages
  for delete to authenticated using (can_read_contact_messages());

-- Solo se puede cambiar el estado; lo que escribió el visitante no se edita
-- (trigger, como 0022: un grant por columna se pierde si alguien re-otorga
-- "all" a la tabla).
create or replace function site_contact_lock_fields()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.message is distinct from old.message
    or new.created_at is distinct from old.created_at then
    raise exception 'contact_readonly';
  end if;
  return new;
end;
$$;

create trigger site_contact_lock_fields
  before update on site_contact_messages
  for each row execute function site_contact_lock_fields();

create or replace function submit_site_contact(
  p_name text,
  p_email text,
  p_phone text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_email is null and v_phone is null then
    raise exception 'contact_missing';
  end if;
  -- Freno simple a la inundación: máximo 3 mensajes por correo en 1 hora.
  if v_email is not null and (
    select count(*) from site_contact_messages
    where email = v_email and created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'too_many';
  end if;
  insert into site_contact_messages (name, email, phone, message)
  values (btrim(p_name), v_email, v_phone, btrim(p_message))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function submit_site_contact(text, text, text, text)
  from anon, authenticated, public;
grant execute on function submit_site_contact(text, text, text, text) to service_role;

notify pgrst, 'reload schema';
