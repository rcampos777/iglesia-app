import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Recibe el `code` que Supabase Auth agrega al link de confirmación de
 * email o de recuperación de contraseña, lo intercambia por una sesión,
 * y redirige a `next` (o /dashboard por defecto).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
