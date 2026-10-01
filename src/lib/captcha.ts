import "server-only";

/**
 * CAPTCHA (Cloudflare Turnstile). Activo cuando hay
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY. Si hay site key pero falta el secreto,
 * falla cerrado: mejor rechazar que dejar pasar sin verificar.
 *
 * - Login, registro y recuperar contraseña: el token se le pasa a
 *   Supabase Auth (`captchaToken`), que lo verifica si su "CAPTCHA
 *   protection" está activa. Así también protege llamadas directas a la
 *   API de Auth. Aquí NO se verifica, porque el token es de un solo uso.
 * - Forma pública de inscripción: se verifica aquí (verifyCaptcha).
 */

export function captchaEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
}

export function captchaTokenFrom(formData: FormData): string {
  const v = formData.get("captchaToken");
  return typeof v === "string" ? v.trim() : "";
}

export const CAPTCHA_MISSING = "Completa la verificación de seguridad e intenta de nuevo.";

export async function verifyCaptcha(token: string): Promise<boolean> {
  if (!captchaEnabled()) return true;
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token || token.length > 2048) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
