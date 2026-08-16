-- Extensiones necesarias.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- Trigger genérico para mantener updated_at actualizado en cualquier tabla.
create or replace function moddatetime_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
