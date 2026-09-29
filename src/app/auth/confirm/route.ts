import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = [
  "recovery",
  "email",
  "signup",
  "magiclink",
  "email_change",
  "invite",
];

/**
 * Valida los enlaces de email de Supabase Auth con `token_hash`
 * (plantillas en docs/email-templates/). A diferencia de
 * /auth/callback (PKCE), no depende de una cookie del navegador donde se
 * pidió el enlace: funciona aunque el email se abra en otro navegador o
 * dispositivo, que es lo normal (pedirlo en el celular y abrirlo en el
 * correo de la computadora, o que Mail abra Safari).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type || !OTP_TYPES.includes(type)) {
    return NextResponse.redirect(`${origin}/login?error=enlace`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=enlace`);
  }

  const fallback = type === "recovery" ? "/recuperar/nueva-contrasena" : "/dashboard";
  return NextResponse.redirect(`${origin}${safeNext(searchParams.get("next"), fallback)}`);
}
