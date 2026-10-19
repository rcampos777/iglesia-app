"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { CAPTCHA_MISSING, captchaEnabled, captchaTokenFrom } from "@/lib/captcha";
import {
  completeProfileSchema,
  forgotPasswordSchema,
  loginSchema,
  oauthProviderSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { safeNext } from "@/lib/auth/safe-next";
import { getCurrentUser } from "@/lib/auth/session";
import { enabledOAuthProviders } from "@/lib/auth/oauth";

function zodFieldErrors(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}) {
  const { fieldErrors } = error.flatten();
  const clean: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (value) clean[key] = value;
  }
  return clean;
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const captchaToken = captchaTokenFrom(formData);
  if (captchaEnabled() && !captchaToken) return actionError(CAPTCHA_MISSING);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    ...parsed.data,
    options: { captchaToken: captchaToken || undefined },
  });

  if (error) {
    if (/captcha/i.test(error.message)) return actionError(CAPTCHA_MISSING);
    if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) {
      return actionError(
        "Tu email todavía no está confirmado. Abre el enlace que te enviamos al registrarte (revisa también la carpeta de spam).",
      );
    }
    return actionError("Email o contraseña incorrectos.");
  }

  revalidatePath("/", "layout");

  const next = formData.get("next");
  // Solo redirigir a rutas internas relativas — nunca a una URL externa.
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  redirect(safeNext);
}

export async function registerAction(formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptPrivacy: formData.get("acceptPrivacy"),
  });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const captchaToken = captchaTokenFrom(formData);
  if (captchaEnabled() && !captchaToken) return actionError(CAPTCHA_MISSING);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      captchaToken: captchaToken || undefined,
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        full_name: `${parsed.data.firstName} ${parsed.data.lastName}`,
        // Aceptó el aviso aquí: al primer inicio de sesión se registra en
        // profiles sin volver a preguntar (ver (app)/layout.tsx).
        privacy_version: PRIVACY_VERSION,
      },
    },
  });

  if (error) {
    // Sin esto el motivo real (límite de emails, SMTP, trigger) no queda en
    // ningún log y solo se ve el mensaje genérico.
    console.error("signUp failed", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    const msg = error.message.toLowerCase();
    if (/captcha/i.test(error.message)) return actionError(CAPTCHA_MISSING);
    if (msg.includes("already registered") || error.code === "user_already_exists") {
      return actionError("Ya existe una cuenta con ese email.");
    }
    if (error.status === 429 || msg.includes("rate limit")) {
      return actionError(
        "Hay muchas personas registrándose ahora mismo. Espera unos minutos e intenta de nuevo.",
      );
    }
    if (msg.includes("sending") && msg.includes("email")) {
      return actionError(
        "No pudimos enviar el email de confirmación. Intenta más tarde o avisa a la iglesia.",
      );
    }
    if (msg.includes("password")) {
      return actionError("La contraseña no cumple los requisitos. Usa una más larga o distinta.");
    }
    return actionError("No se pudo crear la cuenta. Intenta de nuevo.");
  }

  return actionOk(undefined);
}

/**
 * "Continuar con Google/Apple": el mismo botón crea la cuenta la primera
 * vez e inicia sesión las siguientes. Supabase vuelve a /auth/callback,
 * que manda a /completar-perfil si falta el nombre.
 */
export async function oauthSignInAction(formData: FormData): Promise<ActionResult> {
  const parsed = oauthProviderSchema.safeParse(formData.get("provider"));
  if (!parsed.success || !enabledOAuthProviders().includes(parsed.data)) {
    return actionError("Ese método de acceso no está disponible.");
  }

  const nextRaw = formData.get("next");
  const next = safeNext(typeof nextRaw === "string" ? nextRaw : null, "/dashboard");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const callback = new URL("/auth/callback", appUrl);
  callback.searchParams.set("next", next);
  callback.searchParams.set("via", "oauth");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data,
    options: {
      redirectTo: callback.toString(),
      // Google: deja elegir la cuenta en vez de entrar con la última usada.
      queryParams: parsed.data === "google" ? { prompt: "select_account" } : undefined,
    },
  });

  if (error || !data.url) {
    console.error("signInWithOAuth failed", { provider: parsed.data, message: error?.message });
    return actionError("No pudimos conectar con ese proveedor. Intenta de nuevo.");
  }

  redirect(data.url);
}

export async function completeProfileAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nextRaw = formData.get("next");
  const next = safeNext(typeof nextRaw === "string" ? nextRaw : null, "/dashboard");
  if (user.profileComplete) redirect(next);

  const parsed = completeProfileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  const fieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);

  // Quien entra con Google/Apple no pasó por la casilla de /registro: el
  // aviso se acepta aquí, con la misma casilla obligatoria.
  const needsPrivacy = user.privacyVersion !== PRIVACY_VERSION;
  if (needsPrivacy && formData.get("acceptPrivacy") !== "si") {
    fieldErrors.acceptPrivacy = ["Debes leer y aceptar el aviso de privacidad."];
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) {
    return actionError("Revisa los datos ingresados.", fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_my_profile", {
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
  });
  // 55000 = ya estaba completo (p. ej. otra pestaña): no es un error.
  if (error && error.code !== "55000") {
    console.error("complete_my_profile failed", { code: error.code, message: error.message });
    return actionError("No se pudo guardar tu perfil. Intenta de nuevo.");
  }

  if (needsPrivacy) {
    const { error: privacyError } = await supabase.rpc("accept_privacy_notice", {
      p_version: PRIVACY_VERSION,
    });
    // Si falla, el layout vuelve a mostrar el aviso: no se pierde nada.
    if (privacyError) console.error("accept_privacy_notice failed", privacyError.message);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const captchaToken = captchaTokenFrom(formData);
  if (captchaEnabled() && !captchaToken) return actionError(CAPTCHA_MISSING);

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/recuperar/nueva-contrasena`,
    captchaToken: captchaToken || undefined,
  });
  if (error && /captcha/i.test(error.message)) return actionError(CAPTCHA_MISSING);

  // Siempre respondemos "ok" exista o no la cuenta, para no filtrar qué
  // emails están registrados.
  return actionOk(undefined);
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return actionError("No se pudo actualizar la contraseña. Solicita un nuevo enlace.");
  }

  redirect("/login?reset=ok");
}

export async function acceptPrivacyAction(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_privacy_notice", { p_version: PRIVACY_VERSION });
  if (error) throw new Error("No se pudo guardar. Intenta de nuevo.");
  revalidatePath("/", "layout");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
