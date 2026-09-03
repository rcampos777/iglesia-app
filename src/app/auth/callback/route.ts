import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Recibe el `code` que Supabase Auth agrega al link de confirmación de
 * email o de recuperación de contraseña, lo intercambia por una sesión,
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
  const next = searchParams.get("next") ?? "/dashboard";

  // Supabase puede devolver el error directamente en la URL (enlace
  // expirado o ya usado) sin llegar a mandarnos un `code`.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(`${origin}/login?error=enlace`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=enlace`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=enlace`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
