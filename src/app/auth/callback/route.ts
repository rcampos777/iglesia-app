import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

/**
 * Recibe el `code` que Supabase Auth agrega al link de confirmación de
 * email, de recuperación de contraseña o al volver de Google/Apple, lo intercambia por una sesión,
 * y redirige a `next` (o /dashboard por defecto).
 *
 * Cuando algo falla se redirige a /login con un motivo explícito en la
 * query, para que la persona vea QUÉ pasó en vez de aterrizar en un
 * login mudo. Causa más común en la vida real: abrir el enlace del email
 * en un navegador distinto al que se usó para registrarse — el flujo
 * PKCE guarda el `code_verifier` en una cookie del navegador original,
 * así que el intercambio falla aunque la cuenta sí quede confirmada.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/dashboard");
  // Google/Apple: un fallo (o cancelar en la pantalla del proveedor) no
  // tiene nada que ver con enlaces de email; el login lo explica distinto.
  const viaOAuth = searchParams.get("via") === "oauth";
  const failure = `${origin}/login?error=${viaOAuth ? "oauth" : "enlace"}`;

  // Supabase puede devolver el error directamente en la URL (enlace
  // expirado o ya usado) sin llegar a mandarnos un `code`.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError || !code) {
    return NextResponse.redirect(failure);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(failure);
  }

  // Cuenta nueva de Google/Apple (o que abandonó el formulario antes):
  // primero el nombre. El layout de la app lo exige igual (0052).
  if (viaOAuth) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("profile_completed_at")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.profile_completed_at) {
      return NextResponse.redirect(`${origin}/completar-perfil?next=${encodeURIComponent(next)}`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
