-- Bucket público `sitio` para las fotos del sitio web (0038).
--
-- Público = cualquiera puede ver una foto si tiene su URL (son fotos para
-- el sitio público). Solo los editores del sitio pueden subir, reemplazar
-- o borrar. Solo imágenes JPEG/PNG/WebP de hasta 10 MB (la app además las
-- reduce en el navegador antes de subirlas).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sitio', 'sitio', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy sitio_objects_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sitio' and public.can_edit_site());

create policy sitio_objects_update on storage.objects
  for update to authenticated
  using (bucket_id = 'sitio' and public.can_edit_site())
  with check (bucket_id = 'sitio' and public.can_edit_site());

create policy sitio_objects_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'sitio' and public.can_edit_site());
