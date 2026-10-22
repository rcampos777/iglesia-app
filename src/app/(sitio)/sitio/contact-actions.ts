"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { CAPTCHA_MISSING, captchaTokenFrom, verifyCaptcha } from "@/lib/captcha";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { contactSchema } from "@/lib/validations/contact";
import { sendEmail } from "@/lib/email/send";
import { esc } from "@/lib/email/escape";
import { layout } from "@/lib/email/registration-emails";

const ERRORS: Record<string, string> = {
  contact_missing: "Déjanos un correo o un teléfono para responderte.",
  too_many: "Ya recibimos varios mensajes tuyos. Te responderemos pronto.",
};

/** Mismo umbral que la inscripción: los bots llenan la forma al instante. */
const MIN_FILL_MS = 3000;

export async function submitContactAction(formData: FormData): Promise<ActionResult> {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };

  // Trampa anti-spam: se responde "éxito" para no darle pistas al bot.
  const elapsed = Number(str("elapsed"));
  if (str("website") || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    return actionOk(undefined);
  }
  if (!(await verifyCaptcha(captchaTokenFrom(formData)))) {
    return actionError(CAPTCHA_MISSING);
  }

  const parsed = contactSchema.safeParse({
    name: str("name"),
    email: str("email"),
    phone: str("phone"),
    message: str("message"),
  });
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    const clean: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(fieldErrors)) if (v) clean[k] = v;
    return actionError("Revisa los campos marcados.", clean);
  }
  const d = parsed.data;

  // Sin sesión: el cliente de servicio solo llama la función (0056), que
  // valida y guarda; el público no escribe en la tabla.
  const db = createAdminClient();
  const { data: id, error } = await db.rpc("submit_site_contact", {
    p_name: d.name,
    p_email: d.email || null,
    p_phone: d.phone || null,
    p_message: d.message,
  });
  if (error || !id) {
    const known = error ? ERRORS[error.message] : undefined;
    if (!known) console.error("[contacto]", error?.message);
    return actionError(known ?? "No pudimos enviar tu mensaje. Intenta de nuevo en unos minutos.");
  }

  // Aviso a la iglesia, sin el texto del mensaje (puede ser personal): se lee
  // en la app. Si el email falla, el mensaje ya quedó guardado.
  const { data: settings } = await db.from("site_settings").select("email").maybeSingle();
  if (settings?.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const contact = [d.email, d.phone].filter(Boolean).map(esc).join(" · ");
    await sendEmail(
      {
        to: settings.email,
        subject: `Nuevo mensaje desde el sitio web: ${d.name}`,
        html: layout(
          "Nuevo mensaje del sitio web",
          `<p><b>${esc(d.name)}</b> escribió desde la forma de contacto.</p>
<p><b>Contacto:</b> ${contact}</p>
<p><a href="${esc(`${appUrl}/mensajes`)}" style="color:#1D191A">Leer el mensaje en la app</a></p>`,
        ),
        relatedEntityType: "site_contact_message",
        relatedEntityId: id,
        templateCode: "sitio_contacto_aviso",
      },
      db,
    ).catch((err: unknown) => console.error("[contacto] email:", err));
  }

  return actionOk(undefined);
}
