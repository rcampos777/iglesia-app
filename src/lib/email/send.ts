import "server-only";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

let resendClient: Resend | null = null;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Falta RESEND_API_KEY en .env.local.");
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  recipientPersonId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  templateCode?: string;
  createdBy?: string;
}

/**
 * Envía un email vía Resend y registra el intento en notification_log
 * (antes y después de enviar). Nunca pasar contenido confidencial de
 * peticiones de oración a `html` — ver docs/security.md.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Iglesia <notificaciones@example.org>";

  const { data: logRow } = await supabase
    .from("notification_log")
    .insert({
      channel: "email",
      template_code: input.templateCode ?? null,
      recipient_person_id: input.recipientPersonId ?? null,
      recipient_email: input.to,
      subject: input.subject,
      status: "en_cola",
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    if (error) throw new Error(error.message);

    if (logRow) {
      await supabase
        .from("notification_log")
        .update({ status: "enviado", sent_at: new Date().toISOString() })
        .eq("id", logRow.id);
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    if (logRow) {
      await supabase
        .from("notification_log")
        .update({ status: "fallido", error_message: message })
        .eq("id", logRow.id);
    }
    return { ok: false, error: message };
  }
}
