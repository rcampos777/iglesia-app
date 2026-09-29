import { getSupabaseUrl } from "@/lib/supabase/env";

export const SITE_BUCKET = "sitio";

/** URL pública de una foto del bucket `sitio`. */
export function siteMediaUrl(path: string): string {
  // Ruta local (p. ej. /brand/...): se usa tal cual.
  if (path.startsWith("/")) return path;
  return `${getSupabaseUrl()}/storage/v1/object/public/${SITE_BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** "https://youtu.be/ID", "watch?v=ID", "/shorts/ID", "/embed/ID" o el ID solo → ID. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return valid(u.pathname.slice(1));
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v) return valid(v);
      const m = /^\/(?:embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
      if (m?.[1]) return valid(m[1]);
    }
  } catch {
    return null;
  }
  return null;
}

function valid(id: string): string | null {
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** "Grupo de Jóvenes 2026!" → "grupo-de-jovenes-2026". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
