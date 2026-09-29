import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import {
  balanceCents,
  balanceReminderEmail,
  confirmationEmail,
  eventReminderEmail,
  organizerNoticeEmail,
} from "@/lib/email/registration-emails";
import { addDaysToDateKey, churchDateKey } from "@/lib/datetime";

/**
 * Emails automáticos de la inscripción en línea. Corren sin sesión (sitio
 * público y cron), así que usan el cliente de servicio — justificado: la
 * persona que se inscribe no tiene cuenta, y el cron no tiene usuario.
 * Solo leen la actividad/inscripción indicada y escriben notification_log.
 */

export const TEMPLATE = {
  confirmation: "inscripcion_confirmacion",
  organizer: "inscripcion_aviso_organizador",
  balance: "inscripcion_recordatorio_pago",
  event: "inscripcion_recordatorio_evento",
} as const;

/** Días antes de la actividad en que sale cada recordatorio. */
export const BALANCE_REMINDER_DAYS = 10;
export const EVENT_REMINDER_DAYS = 3;

const ENTITY = "activity_registration";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

async function loadRegistration(registrationId: string) {
  const admin = createAdminClient();
  const { data: reg } = await admin
    .from("activity_registrations")
    .select("*")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg) return null;
  const { data: activity } = await admin
    .from("activities")
    .select("*")
    .eq("id", reg.activity_id)
    .maybeSingle();
  if (!activity) return null;
  return { admin, reg, activity };
}

/** Confirmación a la persona. */
export async function sendRegistrationConfirmation(registrationId: string) {
  const loaded = await loadRegistration(registrationId);
  if (!loaded) return { ok: false, error: "Inscripción no encontrada." };
  const { admin, reg, activity } = loaded;
  const email = confirmationEmail(activity, reg);
  return sendEmail(
    {
      to: reg.email,
      ...email,
      recipientPersonId: reg.person_id ?? undefined,
      relatedEntityType: ENTITY,
      relatedEntityId: reg.id,
      templateCode: TEMPLATE.confirmation,
      replyTo: activity.notify_emails,
    },
    admin,
  );
}

/** Aviso a los organizadores (correos configurados + responsable). */
export async function notifyOrganizers(registrationId: string) {
  const loaded = await loadRegistration(registrationId);
  if (!loaded) return;
  const { admin, reg, activity } = loaded;

  const recipients = new Set(activity.notify_emails.map((e) => e.toLowerCase()));
  if (activity.responsible_person_id) {
    const { data: p } = await admin
      .from("people")
      .select("email")
      .eq("id", activity.responsible_person_id)
      .maybeSingle();
    if (p?.email) recipients.add(p.email.toLowerCase());
  }
  if (recipients.size === 0) return;

  const { count } = await admin
    .from("activity_registrations")
    .select("id", { count: "exact", head: true })
    .eq("activity_id", activity.id)
    .is("cancelled_at", null);

  const email = organizerNoticeEmail(activity, reg, {
    needsReview: reg.match_status === "posible_duplicado",
    totalRegistered: count ?? 0,
    appUrl: appUrl(),
  });
  await Promise.allSettled(
    [...recipients].map((to) =>
      sendEmail(
        {
          to,
          ...email,
          relatedEntityType: ENTITY,
          relatedEntityId: reg.id,
          templateCode: TEMPLATE.organizer,
        },
        admin,
      ),
    ),
  );
}

/**
 * Recordatorios diarios (cron). Idempotente: antes de enviar mira en
 * notification_log si ese recordatorio ya salió para esa inscripción. Si
 * un día el cron falla, al siguiente se pone al día (usa "a N días o
 * menos", no "exactamente a N días").
 */
export async function sendDueReminders(now: Date = new Date()) {
  const admin = createAdminClient();
  const today = churchDateKey(now);
  const horizon = addDaysToDateKey(today, BALANCE_REMINDER_DAYS);

  const { data: activities, error } = await admin
    .from("activities")
    .select("*")
    .not("registration_slug", "is", null)
    .neq("status", "cancelada")
    .gte("activity_date", today)
    .lte("activity_date", horizon);
  if (error) throw new Error(`No se pudieron cargar las actividades: ${error.message}`);

  const result = { balance: 0, event: 0, failed: 0 };

  for (const activity of activities ?? []) {
    const { data: regs } = await admin
      .from("activity_registrations")
      .select("*")
      .eq("activity_id", activity.id)
      .is("cancelled_at", null);
    if (!regs?.length) continue;

    const { data: sentRows } = await admin
      .from("notification_log")
      .select("related_entity_id, template_code")
      .eq("related_entity_type", ENTITY)
      .in("template_code", [TEMPLATE.balance, TEMPLATE.event])
      .eq("status", "enviado")
      .in(
        "related_entity_id",
        regs.map((r) => r.id),
      );
    const sent = new Set((sentRows ?? []).map((s) => `${s.template_code}:${s.related_entity_id}`));

    const eventDue = activity.activity_date <= addDaysToDateKey(today, EVENT_REMINDER_DAYS);
    const balanceCutoff = addDaysToDateKey(activity.activity_date, -BALANCE_REMINDER_DAYS);

    for (const reg of regs) {
      let template: (typeof TEMPLATE)[keyof typeof TEMPLATE] | null = null;
      let email: { subject: string; html: string } | null = null;

      if (eventDue) {
        if (!sent.has(`${TEMPLATE.event}:${reg.id}`)) {
          template = TEMPLATE.event;
          email = eventReminderEmail(activity, reg);
        }
      } else if (
        balanceCents(activity, reg) > 0 &&
        // Quien se inscribió ya dentro de la ventana acaba de recibir la
        // confirmación con el balance: no se le repite al día siguiente.
        churchDateKey(reg.created_at) < balanceCutoff &&
        !sent.has(`${TEMPLATE.balance}:${reg.id}`)
      ) {
        template = TEMPLATE.balance;
        email = balanceReminderEmail(activity, reg);
      }

      if (!template || !email) continue;
      const res = await sendEmail(
        {
          to: reg.email,
          ...email,
          recipientPersonId: reg.person_id ?? undefined,
          relatedEntityType: ENTITY,
          relatedEntityId: reg.id,
          templateCode: template,
          replyTo: activity.notify_emails,
        },
        admin,
      );
      if (!res.ok) result.failed++;
      else if (template === TEMPLATE.event) result.event++;
      else result.balance++;
    }
  }
  return result;
}
