-- Contenido del sitio web público (ciudaddeavivamiento.org), editable
-- desde la app. Ver docs/site.md.
--
-- - Todo lo publicable tiene `published`: el público (anon) solo ve lo
--   publicado; los editores (administrador, sitio_web y SuperAdmin) ven y
--   editan todo. Es contenido público por naturaleza: no hay datos
--   personales internos aquí (nombres del equipo pastoral y fotos los
--   decide la iglesia al publicarlos).
-- - Las fotos viven en el bucket público `sitio` (0039); `site_media`
--   guarda la ruta de la foto grande y de la miniatura.
-- - Los horarios de culto NO se duplican: el sitio los lee de la
--   programación de Asistencia (public_service_schedule()).

create or replace function can_edit_site()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select has_any_role(array['administrador', 'sitio_web']::app_role[]);
$$;

comment on function can_edit_site is
  'Editar el sitio público: administrador, sitio_web (y SuperAdmin por 0036).';

create table site_media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  thumb_path text not null,
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  width int,
  height int,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table site_settings (
  id boolean primary key default true check (id),
  hero_eyebrow text not null default 'Bienvenido a',
  hero_title text not null default 'Ciudad de Avivamiento',
  hero_subtitle text,
  hero_media_id uuid references site_media (id) on delete set null,
  about_title text not null default 'Una familia en la fe',
  about_text text,
  about_media_id uuid references site_media (id) on delete set null,
  mission_text text,
  address text,
  phone text,
  email text,
  map_query text,
  instagram_url text,
  facebook_url text,
  youtube_url text,
  portal_url text not null default 'https://app.ciudaddeavivamiento.org/login',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Datos públicos que ya estaban en la landing (landing/index.html). Los
-- textos de misión/historia quedan vacíos: la iglesia no los ha redactado.
insert into site_settings (
  id, hero_subtitle, address, phone, email, map_query,
  instagram_url, facebook_url, youtube_url
) values (
  true,
  'Una iglesia en Ponce, Puerto Rico, dedicada a la adoración, la enseñanza de la Palabra y el servicio a nuestra comunidad.',
  'Calle Villa Final, Bo. Río Cañas Cangrejos, Carretera 132 Km 25.3, Ponce, PR',
  '+1 787-644-2544',
  'pabellonponce@aol.com',
  'Calle Villa Final, Bo. Río Cañas Cangrejos, Carretera 132 Km 25.3, Ponce, PR',
  'https://www.instagram.com/ciudaddeavivamiento7/',
  'https://www.facebook.com/Jesucristoeseldiostodopoderoso/',
  'https://www.youtube.com/@CiudaddeAvivamientoPonce'
);

create table site_albums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 120),
  description text,
  album_date date,
  cover_media_id uuid references site_media (id) on delete set null,
  published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table site_album_photos (
  album_id uuid not null references site_albums (id) on delete cascade,
  media_id uuid not null references site_media (id) on delete cascade,
  sort_order int not null default 0,
  caption text check (caption is null or char_length(caption) <= 200),
  primary key (album_id, media_id)
);

create index site_album_photos_media_idx on site_album_photos (media_id);

-- Eventos (con fecha) y anuncios (avisos, con "visible hasta" opcional).
create table site_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('evento', 'anuncio')),
  title text not null check (char_length(title) between 1 and 150),
  body text check (body is null or char_length(body) <= 5000),
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  media_id uuid references site_media (id) on delete set null,
  link_url text check (link_url is null or link_url ~ '^https?://'),
  link_label text,
  visible_until date,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (kind <> 'evento' or starts_at is not null),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index site_posts_published_idx on site_posts (published, kind, starts_at);

create table site_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 150),
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  description text,
  recorded_on date,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table site_ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  media_id uuid references site_media (id) on delete set null,
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table site_team (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  role_title text,
  bio text,
  media_id uuid references site_media (id) on delete set null,
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: público ve lo publicado; editores ven y editan todo.
-- ---------------------------------------------------------------------

alter table site_media enable row level security;
alter table site_settings enable row level security;
alter table site_albums enable row level security;
alter table site_album_photos enable row level security;
alter table site_posts enable row level security;
alter table site_videos enable row level security;
alter table site_ministries enable row level security;
alter table site_team enable row level security;

-- Las fotos están en un bucket público; su metadato (ruta, texto
-- alternativo) también es público.
create policy site_media_select on site_media for select using (true);
create policy site_settings_select on site_settings for select using (true);
create policy site_albums_select on site_albums for select using (published or can_edit_site());
create policy site_album_photos_select on site_album_photos for select using (
  can_edit_site() or exists (select 1 from site_albums a where a.id = album_id and a.published)
);
create policy site_posts_select on site_posts for select using (published or can_edit_site());
create policy site_videos_select on site_videos for select using (published or can_edit_site());
create policy site_ministries_select on site_ministries for select using (published or can_edit_site());
create policy site_team_select on site_team for select using (published or can_edit_site());

create policy site_media_write on site_media for all
  using (can_edit_site()) with check (can_edit_site());
create policy site_settings_update on site_settings for update
  using (can_edit_site()) with check (can_edit_site());
create policy site_albums_write on site_albums for all
  using (can_edit_site()) with check (can_edit_site());
create policy site_album_photos_write on site_album_photos for all
  using (can_edit_site()) with check (can_edit_site());
create policy site_posts_write on site_posts for all
  using (can_edit_site()) with check (can_edit_site());
create policy site_videos_write on site_videos for all
  using (can_edit_site()) with check (can_edit_site());
create policy site_ministries_write on site_ministries for all
  using (can_edit_site()) with check (can_edit_site());
create policy site_team_write on site_team for all
  using (can_edit_site()) with check (can_edit_site());

-- ---------------------------------------------------------------------
-- Horarios públicos: la misma programación de Asistencia (0032).
-- ---------------------------------------------------------------------

create or replace function public_service_schedule()
returns table (weekday smallint, local_time time, name text)
language sql
stable
security definer
set search_path = public
as $$
  select r.weekday, r.local_time, r.name
  from service_series_rules r
  where r.effective_from <= (now() at time zone church_timezone())::date
    and (r.effective_until is null or r.effective_until >= (now() at time zone church_timezone())::date)
  order by r.weekday, r.local_time;
$$;

comment on function public_service_schedule is
  'Horarios vigentes hoy (día, hora local, nombre) para el sitio público. '
  'Solo expone la programación, nada de asistencia.';

revoke all on function public_service_schedule() from public;
grant execute on function public_service_schedule() to anon, authenticated;
