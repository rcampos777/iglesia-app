-- Bucket PRIVADO `certificaciones` para los archivos de 0042 (PDF o foto
-- del documento, hasta 10 MB). Solo apostol y finanzas leen o suben;
-- el archivo se abre con una URL firmada de corta duración que la app
-- pide después de registrar la apertura (certification_log_file_view).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificaciones', 'certificaciones', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy certificaciones_objects_select on storage.objects
  for select to authenticated
  using (bucket_id = 'certificaciones' and public.has_finance_access());

create policy certificaciones_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'certificaciones' and public.has_finance_access());

create policy certificaciones_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'certificaciones' and public.has_finance_access())
  with check (bucket_id = 'certificaciones' and public.has_finance_access());

create policy certificaciones_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'certificaciones' and public.has_finance_access());
