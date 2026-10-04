-- Eventos del sitio: la hora es opcional (pedido del dueño, 2026-10-04).
--
-- starts_at/ends_at siguen siendo timestamptz (así no cambian las consultas
-- de próximos y pasados). Sin hora, el inicio se guarda a las 00:00 de PR y
-- el fin a las 23:59 de PR; estas columnas dicen si la hora se escribió y,
-- por lo tanto, si se muestra.
alter table site_posts
  add column start_has_time boolean not null default true,
  add column end_has_time boolean not null default true;

comment on column site_posts.start_has_time is
  'false = el evento solo tiene fecha de inicio; no mostrar la hora de starts_at.';
comment on column site_posts.end_has_time is
  'false = no mostrar la hora de ends_at (fin de día sin hora o fin automático).';

notify pgrst, 'reload schema';
