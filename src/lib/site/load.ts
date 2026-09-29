import "server-only";
import type { PublicSettings } from "@/lib/data/site";

/** Una sección que falla no debe tumbar el sitio público. */
export async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[sitio] ${label}:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

/** Si aún no existe la configuración (base sin migrar), el sitio igual se ve. */
export const FALLBACK_SETTINGS: PublicSettings = {
  id: true,
  hero_eyebrow: "Bienvenido a",
  hero_title: "Ciudad de Avivamiento",
  hero_subtitle: "Una iglesia en Ponce, Puerto Rico.",
  hero_media_id: null,
  about_title: "Una familia en la fe",
  about_text: null,
  about_media_id: null,
  mission_text: null,
  address: null,
  phone: null,
  email: null,
  map_query: null,
  instagram_url: null,
  facebook_url: null,
  youtube_url: null,
  portal_url: "https://app.ciudaddeavivamiento.org/login",
  updated_at: new Date(0).toISOString(),
  updated_by: null,
  heroMedia: null,
  aboutMedia: null,
};
