import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { churchDateKey } from "@/lib/datetime";
import type {
  SiteAlbumRow,
  SiteMediaRow,
  SiteMinistryRow,
  SitePostRow,
  SiteSettingsRow,
  SiteTeamRow,
  SiteVideoRow,
} from "@/types/database";

/**
 * Contenido del sitio. Las funciones `public*` usan el cliente anónimo sin
 * cookies (solo lo publicado, cacheable). Las `editor*` usan la sesión y
 * ven también borradores (RLS: can_edit_site()).
 */

type MediaMap = Map<string, SiteMediaRow>;

async function mediaByIds(
  client: ReturnType<typeof createPublicClient>,
  ids: (string | null | undefined)[],
): Promise<MediaMap> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return new Map();
  const { data, error } = await client.from("site_media").select("*").in("id", unique);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((m) => [m.id, m]));
}

export type WithMedia<T> = T & { media: SiteMediaRow | null };

function attach<T extends { media_id: string | null }>(rows: T[], map: MediaMap): WithMedia<T>[] {
  return rows.map((r) => ({ ...r, media: r.media_id ? (map.get(r.media_id) ?? null) : null }));
}

export type PublicSettings = SiteSettingsRow & {
  heroMedia: SiteMediaRow | null;
  aboutMedia: SiteMediaRow | null;
};

export async function publicSettings(): Promise<PublicSettings | null> {
  const db = createPublicClient();
  const { data, error } = await db.from("site_settings").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const media = await mediaByIds(db, [data.hero_media_id, data.about_media_id]);
  return {
    ...data,
    heroMedia: data.hero_media_id ? (media.get(data.hero_media_id) ?? null) : null,
    aboutMedia: data.about_media_id ? (media.get(data.about_media_id) ?? null) : null,
  };
}

export async function publicSchedule() {
  const db = createPublicClient();
  const { data, error } = await db.rpc("public_service_schedule");
  if (error) throw new Error(error.message);
  // Domingo al final de la semana no: la iglesia lo presenta primero.
  return data ?? [];
}

/** Eventos que no han terminado (o empiezan hoy o después), en orden. */
export async function publicUpcomingEvents(limit = 20): Promise<WithMedia<SitePostRow>[]> {
  const db = createPublicClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("site_posts")
    .select("*")
    .eq("kind", "evento")
    .or(
      `ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${new Date(Date.now() - 12 * 3600_000).toISOString()})`,
    )
    .order("starts_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return attach(
    rows,
    await mediaByIds(
      db,
      rows.map((r) => r.media_id),
    ),
  );
}

export async function publicPastEvents(limit = 12): Promise<WithMedia<SitePostRow>[]> {
  const db = createPublicClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("site_posts")
    .select("*")
    .eq("kind", "evento")
    .lt("starts_at", now)
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((r) => !r.ends_at || r.ends_at < now);
  return attach(
    rows,
    await mediaByIds(
      db,
      rows.map((r) => r.media_id),
    ),
  );
}

/** Anuncios vigentes (sin "visible hasta" o hasta hoy inclusive, hora de PR). */
export async function publicAnnouncements(limit = 6): Promise<WithMedia<SitePostRow>[]> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("site_posts")
    .select("*")
    .eq("kind", "anuncio")
    .or(`visible_until.is.null,visible_until.gte.${churchDateKey()}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return attach(
    rows,
    await mediaByIds(
      db,
      rows.map((r) => r.media_id),
    ),
  );
}

export async function publicPost(id: string): Promise<WithMedia<SitePostRow> | null> {
  const db = createPublicClient();
  const { data, error } = await db.from("site_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return attach([data], await mediaByIds(db, [data.media_id]))[0]!;
}

export type AlbumCard = SiteAlbumRow & { cover: SiteMediaRow | null; photoCount: number };

async function albumPhotoLinks(
  db: ReturnType<typeof createPublicClient>,
  albumIds: string[],
): Promise<Map<string, { media_id: string; sort_order: number }[]>> {
  const map = new Map<string, { media_id: string; sort_order: number }[]>();
  if (albumIds.length === 0) return map;
  const { data, error } = await db
    .from("site_album_photos")
    .select("album_id, media_id, sort_order")
    .in("album_id", albumIds)
    .order("sort_order");
  if (error) throw new Error(error.message);
  for (const l of data ?? []) {
    const list = map.get(l.album_id) ?? [];
    list.push({ media_id: l.media_id, sort_order: l.sort_order });
    map.set(l.album_id, list);
  }
  return map;
}

export async function publicAlbums(limit = 60): Promise<AlbumCard[]> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("site_albums")
    .select("*")
    .order("sort_order")
    .order("album_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const links = await albumPhotoLinks(
    db,
    rows.map((a) => a.id),
  );
  const coverIds = rows.map((a) => a.cover_media_id ?? links.get(a.id)?.[0]?.media_id ?? null);
  const media = await mediaByIds(db, coverIds);
  return rows.map((a, i) => ({
    ...a,
    cover: coverIds[i] ? (media.get(coverIds[i]!) ?? null) : null,
    photoCount: links.get(a.id)?.length ?? 0,
  }));
}

export async function publicAlbum(slug: string) {
  const db = createPublicClient();
  const { data: album, error } = await db
    .from("site_albums")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!album) return null;
  const { data: links, error: e2 } = await db
    .from("site_album_photos")
    .select("*")
    .eq("album_id", album.id)
    .order("sort_order");
  if (e2) throw new Error(e2.message);
  const media = await mediaByIds(
    db,
    (links ?? []).map((l) => l.media_id),
  );
  const photos = (links ?? [])
    .map((l) => ({ ...l, media: media.get(l.media_id) }))
    .filter((p): p is typeof p & { media: SiteMediaRow } => Boolean(p.media));
  return { album, photos };
}

export async function publicVideos(limit = 24): Promise<SiteVideoRow[]> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("site_videos")
    .select("*")
    .order("featured", { ascending: false })
    .order("recorded_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function publicMinistries(): Promise<WithMedia<SiteMinistryRow>[]> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("site_ministries")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return attach(
    rows,
    await mediaByIds(
      db,
      rows.map((r) => r.media_id),
    ),
  );
}

export async function publicTeam(): Promise<WithMedia<SiteTeamRow>[]> {
  const db = createPublicClient();
  const { data, error } = await db.from("site_team").select("*").order("sort_order").order("name");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return attach(
    rows,
    await mediaByIds(
      db,
      rows.map((r) => r.media_id),
    ),
  );
}

// ---------------------------------------------------------------------
// Editor (sesión: ve borradores)
// ---------------------------------------------------------------------

export async function editorMedia(limit = 200): Promise<SiteMediaRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("site_media")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function editorSettings(): Promise<SiteSettingsRow | null> {
  const db = await createClient();
  const { data, error } = await db.from("site_settings").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function editorPosts(): Promise<SitePostRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("site_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function editorAlbums() {
  const db = await createClient();
  const { data, error } = await db
    .from("site_albums")
    .select("*")
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const links = await albumPhotoLinks(
    db,
    rows.map((a) => a.id),
  );
  return rows.map((a) => ({ ...a, photoCount: links.get(a.id)?.length ?? 0 }));
}

export async function editorAlbum(id: string) {
  const db = await createClient();
  const { data: album, error } = await db
    .from("site_albums")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!album) return null;
  const { data: photos, error: e2 } = await db
    .from("site_album_photos")
    .select("*")
    .eq("album_id", id)
    .order("sort_order");
  if (e2) throw new Error(e2.message);
  return { album, photos: photos ?? [] };
}

export async function editorVideos(): Promise<SiteVideoRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("site_videos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function editorMinistries(): Promise<SiteMinistryRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("site_ministries")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function editorTeam(): Promise<SiteTeamRow[]> {
  const db = await createClient();
  const { data, error } = await db.from("site_team").select("*").order("sort_order").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
