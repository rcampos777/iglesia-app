"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { partsToRange } from "@/lib/site/event-time";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requireRole } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { SITE_BUCKET, parseYouTubeId, slugify } from "@/lib/site/media";
import type { AppRole } from "@/types/database";

// Primera barrera: rol en el servidor. La real: RLS can_edit_site() en
// cada tabla y en el bucket `sitio`.
const SITE_ROLES: AppRole[] = ["administrador", "sitio_web"];

async function guard(): Promise<{ userId: string } | ActionResult<never>> {
  try {
    const user = await requireRole(SITE_ROLES);
    return { userId: user.userId };
  } catch (err) {
    if (err instanceof AuthError) return actionError("No tienes permiso para editar el sitio web.");
    throw err;
  }
}

function denied(g: Awaited<ReturnType<typeof guard>>): g is ActionResult<never> {
  return "ok" in g;
}

/** El sitio público se regenera al guardar (ISR). */
function refresh(path?: string) {
  revalidatePath("/sitio", "layout");
  revalidatePath("/sitio-web", "layout");
  if (path) revalidatePath(path);
}

function first(e: z.ZodError) {
  return e.issues[0]?.message ?? "Revisa los datos.";
}

function dbError(message: string): string {
  if (/duplicate key.*slug/.test(message)) return "Ya existe un álbum con esa dirección (slug).";
  if (/row-level security|permission denied/.test(message)) {
    return "No tienes permiso para editar el sitio web.";
  }
  if (/check constraint/.test(message)) return "Algún dato no es válido. Revísalo.";
  return "No se pudo guardar. Intenta de nuevo.";
}

const uuid = z.string().uuid();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => v || null);
const optUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//.test(v), "El enlace debe empezar con https://")
  .transform((v) => v || null);
const optMedia = z
  .string()
  .uuid()
  .nullable()
  .or(z.literal("").transform(() => null));

// ---------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------

const PATH_RE = /^\d{4}\/[0-9a-f-]{36}(-t)?\.(jpg|png|webp)$/;

export async function registerMediaAction(input: {
  storagePath: string;
  thumbPath: string;
  alt: string;
  width: number;
  height: number;
}): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (denied(g)) return g;
  if (!PATH_RE.test(input.storagePath) || !PATH_RE.test(input.thumbPath)) {
    return actionError("Ruta de foto inválida.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_media")
    .insert({
      storage_path: input.storagePath,
      thumb_path: input.thumbPath,
      alt_text: input.alt.trim().slice(0, 200),
      width: Number.isInteger(input.width) ? input.width : null,
      height: Number.isInteger(input.height) ? input.height : null,
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (error || !data) return actionError(dbError(error?.message ?? ""));
  refresh();
  return actionOk({ id: data.id });
}

export async function updateMediaAltAction(id: string, alt: string): Promise<ActionResult> {
  const g = await guard();
  if (denied(g)) return g;
  if (!uuid.safeParse(id).success) return actionError("Foto inválida.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_media")
    .update({ alt_text: alt.trim().slice(0, 200) })
    .eq("id", id);
  if (error) return actionError(dbError(error.message));
  refresh();
  return actionOk(undefined);
}

/** Borra la foto del sitio (se quita también de álbumes; portadas quedan vacías). */
export async function deleteMediaAction(id: string): Promise<ActionResult> {
  const g = await guard();
  if (denied(g)) return g;
  if (!uuid.safeParse(id).success) return actionError("Foto inválida.");
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("site_media")
    .select("storage_path, thumb_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return actionError("No se encontró la foto.");
  const { error } = await supabase.from("site_media").delete().eq("id", id);
  if (error) return actionError(dbError(error.message));
  // Si el archivo no se pudiera borrar queda huérfano en el bucket, pero
  // ya no aparece en ningún lugar del sitio.
  await supabase.storage.from(SITE_BUCKET).remove([row.storage_path, row.thumb_path]);
  refresh();
  return actionOk(undefined);
}

// ---------------------------------------------------------------------
// Datos generales
// ---------------------------------------------------------------------

const settingsSchema = z.object({
  heroEyebrow: z.string().trim().min(1).max(60),
  heroTitle: z.string().trim().min(1, "Escribe el título.").max(120),
  heroSubtitle: optText(400),
  heroMediaId: optMedia,
  aboutTitle: z.string().trim().min(1, "Escribe el título de Quiénes somos.").max(120),
  aboutText: optText(4000),
  aboutMediaId: optMedia,
  missionText: optText(300),
  address: optText(300),
  phone: optText(40),
  email: optText(120),
  mapQuery: optText(300),
  instagramUrl: optUrl,
  facebookUrl: optUrl,
  youtubeUrl: optUrl,
  portalUrl: z.string().trim().url("Enlace del portal inválido."),
});

export async function saveSiteSettingsAction(
  input: z.input<typeof settingsSchema>,
): Promise<ActionResult> {
  const g = await guard();
  if (denied(g)) return g;
  const p = settingsSchema.safeParse(input);
  if (!p.success) return actionError(first(p.error));
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .update({
      hero_eyebrow: d.heroEyebrow,
      hero_title: d.heroTitle,
      hero_subtitle: d.heroSubtitle,
      hero_media_id: d.heroMediaId,
      about_title: d.aboutTitle,
      about_text: d.aboutText,
      about_media_id: d.aboutMediaId,
      mission_text: d.missionText,
      address: d.address,
      phone: d.phone,
      email: d.email,
      map_query: d.mapQuery,
      instagram_url: d.instagramUrl,
      facebook_url: d.facebookUrl,
      youtube_url: d.youtubeUrl,
      portal_url: d.portalUrl,
      updated_at: new Date().toISOString(),
      updated_by: g.userId,
    })
    .eq("id", true);
  if (error) return actionError(dbError(error.message));
  refresh();
  return actionOk(undefined);
}

// ---------------------------------------------------------------------
// Eventos y anuncios
// ---------------------------------------------------------------------

const postSchema = z.object({
  id: uuid.nullable(),
  kind: z.enum(["evento", "anuncio"]),
  title: z.string().trim().min(1, "Escribe el título.").max(150),
  body: optText(5000),
  startDate: z.string().max(10),
  startTime: z.string().max(5),
  endDate: z.string().max(10),
  endTime: z.string().max(5),
  location: optText(200),
  mediaId: optMedia,
  linkUrl: optUrl,
  linkLabel: optText(60),
  visibleUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .or(z.literal("").transform(() => null)),
  published: z.boolean(),
});

export async function savePostAction(
  input: z.input<typeof postSchema>,
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (denied(g)) return g;
  const p = postSchema.safeParse(input);
  if (!p.success) return actionError(first(p.error));
  const d = p.data;
  // Hora opcional (0050). Los anuncios no llevan fecha de evento.
  const when =
    d.kind === "evento"
      ? partsToRange(d)
      : { startsAt: null, endsAt: null, startHasTime: true, endHasTime: true };
  if (typeof when === "string") return actionError(when);
  const row = {
    kind: d.kind,
    title: d.title,
    body: d.body,
    starts_at: when.startsAt,
    ends_at: when.endsAt,
    start_has_time: when.startHasTime,
    end_has_time: when.endHasTime,
    location: d.kind === "evento" ? d.location : null,
    media_id: d.mediaId,
    link_url: d.linkUrl,
    link_label: d.linkLabel,
    visible_until: d.visibleUntil,
    published: d.published,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const res = d.id
    ? await supabase.from("site_posts").update(row).eq("id", d.id).select("id").single()
    : await supabase
        .from("site_posts")
        .insert({ ...row, created_by: g.userId })
        .select("id")
        .single();
  if (res.error || !res.data) return actionError(dbError(res.error?.message ?? ""));
  refresh();
  return actionOk({ id: res.data.id });
}

export async function deletePostAction(id: string): Promise<ActionResult> {
  return deleteRow("site_posts", id);
}

// ---------------------------------------------------------------------
// Álbumes
// ---------------------------------------------------------------------

const albumSchema = z.object({
  id: uuid.nullable(),
  title: z.string().trim().min(1, "Escribe el título del álbum.").max(120),
  slug: z.string().trim().max(80),
  description: optText(2000),
  albumDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .or(z.literal("").transform(() => null)),
  coverMediaId: optMedia,
  published: z.boolean(),
  sortOrder: z.coerce.number().int().min(-1000).max(1000),
});

export async function saveAlbumAction(
  input: z.input<typeof albumSchema>,
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (denied(g)) return g;
  const p = albumSchema.safeParse(input);
  if (!p.success) return actionError(first(p.error));
  const d = p.data;
  const slug = slugify(d.slug || d.title);
  if (!slug) return actionError("Escribe un título con letras o números.");
  const row = {
    title: d.title,
    slug,
    description: d.description,
    album_date: d.albumDate,
    cover_media_id: d.coverMediaId,
    published: d.published,
    sort_order: d.sortOrder,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const res = d.id
    ? await supabase.from("site_albums").update(row).eq("id", d.id).select("id").single()
    : await supabase
        .from("site_albums")
        .insert({ ...row, created_by: g.userId })
        .select("id")
        .single();
  if (res.error || !res.data) return actionError(dbError(res.error?.message ?? ""));
  refresh();
  return actionOk({ id: res.data.id });
}

export async function deleteAlbumAction(id: string): Promise<ActionResult> {
  return deleteRow("site_albums", id);
}

export async function addAlbumPhotosAction(
  albumId: string,
  mediaIds: string[],
): Promise<ActionResult> {
  const g = await guard();
  if (denied(g)) return g;
  if (!uuid.safeParse(albumId).success || !mediaIds.every((m) => uuid.safeParse(m).success)) {
    return actionError("Datos inválidos.");
  }
  if (mediaIds.length === 0) return actionOk(undefined);
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("site_album_photos")
    .select("sort_order")
    .eq("album_id", albumId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("site_album_photos").upsert(
    mediaIds.map((m, i) => ({ album_id: albumId, media_id: m, sort_order: start + i })),
    { onConflict: "album_id,media_id", ignoreDuplicates: true },
  );
  if (error) return actionError(dbError(error.message));
  refresh();
  return actionOk(undefined);
}

export async function removeAlbumPhotoAction(
  albumId: string,
  mediaId: string,
): Promise<ActionResult> {
  const g = await guard();
  if (denied(g)) return g;
  if (!uuid.safeParse(albumId).success || !uuid.safeParse(mediaId).success) {
    return actionError("Datos inválidos.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_album_photos")
    .delete()
    .eq("album_id", albumId)
    .eq("media_id", mediaId);
  if (error) return actionError(dbError(error.message));
  refresh();
  return actionOk(undefined);
}

/** Guarda el orden completo de las fotos del álbum (lista de media_id). */
export async function reorderAlbumAction(
  albumId: string,
  orderedMediaIds: string[],
): Promise<ActionResult> {
  const g = await guard();
  if (denied(g)) return g;
  if (
    !uuid.safeParse(albumId).success ||
    !orderedMediaIds.every((m) => uuid.safeParse(m).success)
  ) {
    return actionError("Datos inválidos.");
  }
  const supabase = await createClient();
  const { error } = await supabase.from("site_album_photos").upsert(
    orderedMediaIds.map((m, i) => ({ album_id: albumId, media_id: m, sort_order: i })),
    { onConflict: "album_id,media_id" },
  );
  if (error) return actionError(dbError(error.message));
  refresh();
  return actionOk(undefined);
}

// ---------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------

const videoSchema = z.object({
  id: uuid.nullable(),
  title: z.string().trim().min(1, "Escribe el título.").max(150),
  url: z.string().trim().max(300),
  description: optText(2000),
  recordedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .or(z.literal("").transform(() => null)),
  featured: z.boolean(),
  published: z.boolean(),
});

export async function saveVideoAction(
  input: z.input<typeof videoSchema>,
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (denied(g)) return g;
  const p = videoSchema.safeParse(input);
  if (!p.success) return actionError(first(p.error));
  const d = p.data;
  const youtubeId = parseYouTubeId(d.url);
  if (!youtubeId) return actionError("Pega el enlace de un video de YouTube.");
  const row = {
    title: d.title,
    youtube_id: youtubeId,
    description: d.description,
    recorded_on: d.recordedOn,
    featured: d.featured,
    published: d.published,
  };
  const supabase = await createClient();
  const res = d.id
    ? await supabase.from("site_videos").update(row).eq("id", d.id).select("id").single()
    : await supabase
        .from("site_videos")
        .insert({ ...row, created_by: g.userId })
        .select("id")
        .single();
  if (res.error || !res.data) return actionError(dbError(res.error?.message ?? ""));
  refresh();
  return actionOk({ id: res.data.id });
}

export async function deleteVideoAction(id: string): Promise<ActionResult> {
  return deleteRow("site_videos", id);
}

// ---------------------------------------------------------------------
// Ministerios y equipo pastoral (misma forma)
// ---------------------------------------------------------------------

const cardSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(1, "Escribe el nombre.").max(120),
  subtitle: optText(120),
  description: optText(2000),
  mediaId: optMedia,
  sortOrder: z.coerce.number().int().min(-1000).max(1000),
  published: z.boolean(),
});

export type CardInput = z.input<typeof cardSchema>;

export async function saveCardAction(
  table: "site_ministries" | "site_team",
  input: CardInput,
): Promise<ActionResult<{ id: string }>> {
  const g = await guard();
  if (denied(g)) return g;
  if (table !== "site_ministries" && table !== "site_team") return actionError("Datos inválidos.");
  const p = cardSchema.safeParse(input);
  if (!p.success) return actionError(first(p.error));
  const d = p.data;
  const supabase = await createClient();
  const common = {
    name: d.name,
    media_id: d.mediaId,
    sort_order: d.sortOrder,
    published: d.published,
  };
  const res =
    table === "site_team"
      ? d.id
        ? await supabase
            .from("site_team")
            .update({ ...common, role_title: d.subtitle, bio: d.description })
            .eq("id", d.id)
            .select("id")
            .single()
        : await supabase
            .from("site_team")
            .insert({ ...common, role_title: d.subtitle, bio: d.description })
            .select("id")
            .single()
      : d.id
        ? await supabase
            .from("site_ministries")
            .update({ ...common, description: d.description })
            .eq("id", d.id)
            .select("id")
            .single()
        : await supabase
            .from("site_ministries")
            .insert({ ...common, description: d.description })
            .select("id")
            .single();
  if (res.error || !res.data) return actionError(dbError(res.error?.message ?? ""));
  refresh();
  return actionOk({ id: res.data.id });
}

export async function deleteCardAction(
  table: "site_ministries" | "site_team",
  id: string,
): Promise<ActionResult> {
  if (table !== "site_ministries" && table !== "site_team") return actionError("Datos inválidos.");
  return deleteRow(table, id);
}

async function deleteRow(
  table: "site_posts" | "site_albums" | "site_videos" | "site_ministries" | "site_team",
  id: string,
): Promise<ActionResult> {
  const g = await guard();
  if (denied(g)) return g;
  if (!uuid.safeParse(id).success) return actionError("Datos inválidos.");
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return actionError(dbError(error.message));
  refresh();
  return actionOk(undefined);
}
