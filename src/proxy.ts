import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Dominio del sitio público (ciudaddeavivamiento.org): se sirve la sección
 * /sitio de esta misma app, sin sesión. El resto de dominios (app.…) sigue
 * el flujo normal con sesión. SITE_HOSTS permite cambiarlo por entorno.
 */
const SITE_HOSTS = (process.env.SITE_HOSTS ?? "ciudaddeavivamiento.org,www.ciudaddeavivamiento.org")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  if (SITE_HOSTS.includes(host)) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/sitio") || pathname.startsWith("/_next")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/sitio${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
