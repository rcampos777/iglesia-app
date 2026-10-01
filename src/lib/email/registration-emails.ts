import "server-only";
import { esc, para } from "./escape";
import { formatDateKeyInline, formatLocalTime } from "@/lib/datetime";
import { formatCents } from "@/lib/money";
import { personalizeLetter } from "@/lib/registrations/letter";
import type { ActivityRegistrationRow, ActivityRow } from "@/types/database";

/**
 * Emails de la inscripción en línea. Nunca incluyen datos médicos: esos
 * solo se ven dentro de la app (docs/registrations.md).
 */

export type RegistrationEmailActivity = Pick<
  ActivityRow,
  | "id"
  | "name"
  | "activity_date"
  | "end_date"
  | "start_time"
  | "location"
  | "price_cents"
  | "deposit_cents"
  | "payment_instructions"
  | "what_to_bring"
  | "contact_info"
  | "confirmation_message"
>;

export type RegistrationEmailPerson = Pick<
  ActivityRegistrationRow,
  "first_name" | "last_name" | "amount_paid_cents"
>;

export function activityDateText(a: Pick<ActivityRow, "activity_date" | "end_date">): string {
  if (!a.end_date || a.end_date === a.activity_date) return formatDateKeyInline(a.activity_date);
  return `${formatDateKeyInline(a.activity_date, false)} al ${formatDateKeyInline(a.end_date)}`;
}

export function balanceCents(a: RegistrationEmailActivity, r: RegistrationEmailPerson): number {
  return Math.max(0, (a.price_cents ?? 0) - r.amount_paid_cents);
}

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F5F0E8;font-family:Helvetica,Arial,sans-serif;color:#1D191A">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#1D191A;color:#F1E5C6;border-radius:16px 16px 0 0;padding:20px 24px;font-size:20px">${esc(title)}</div>
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:24px;font-size:16px;line-height:24px">${body}</div>
<p style="font-size:12px;color:#888;text-align:center;margin-top:16px">Ciudad de Avivamiento</p>
</div></body></html>`;
}

function detailsBlock(a: RegistrationEmailActivity): string {
  const rows: string[] = [`<b>Fecha:</b> ${esc(activityDateText(a))}`];
  if (a.start_time) rows.push(`<b>Hora de llegada:</b> ${esc(formatLocalTime(a.start_time))}`);
  if (a.location) rows.push(`<b>Lugar:</b> ${esc(a.location)}`);
  return `<p style="background:#F5F0E8;border-radius:12px;padding:12px 16px">${rows.join("<br>")}</p>`;
}

function moneyBlock(a: RegistrationEmailActivity, r: RegistrationEmailPerson): string {
  if (!a.price_cents) return "";
  const lines = [`<b>Costo total:</b> ${formatCents(a.price_cents)}`];
  if (a.deposit_cents) {
    lines.push(`<b>Depósito para reservar (no reembolsable):</b> ${formatCents(a.deposit_cents)}`);
  }
  if (r.amount_paid_cents > 0) lines.push(`<b>Has pagado:</b> ${formatCents(r.amount_paid_cents)}`);
  lines.push(`<b>Balance pendiente:</b> ${formatCents(balanceCents(a, r))}`);
  return `<p>${lines.join("<br>")}</p>`;
}

function paymentBlock(a: RegistrationEmailActivity): string {
  return a.payment_instructions
    ? `<p><b>Cómo pagar</b><br>${para(a.payment_instructions)}</p>`
    : "";
}

function contactBlock(a: RegistrationEmailActivity): string {
  return a.contact_info ? `<p><b>Para más información</b><br>${para(a.contact_info)}</p>` : "";
}

export function confirmationEmail(a: RegistrationEmailActivity, r: RegistrationEmailPerson) {
  return {
    subject: `Inscripción recibida: ${a.name}`,
    html: layout(
      a.name,
      `${
        a.confirmation_message
          ? `<p>${para(personalizeLetter(a.confirmation_message, r.first_name))}</p>
<hr style="border:none;border-top:1px solid #e5dccb;margin:24px 0">
<p><b>Detalles de tu inscripción</b></p>`
          : `<p>¡Hola, ${esc(r.first_name)}! Recibimos tu inscripción. Nos alegra que vengas.</p>`
      }
${detailsBlock(a)}
${moneyBlock(a, r)}
${a.deposit_cents ? `<p>Tu espacio queda reservado cuando recibamos el depósito de ${formatCents(a.deposit_cents)}.</p>` : ""}
${paymentBlock(a)}
${contactBlock(a)}
<p>Guarda este correo. Te escribiremos de nuevo antes de la fecha.</p>`,
    ),
  };
}

export function balanceReminderEmail(a: RegistrationEmailActivity, r: RegistrationEmailPerson) {
  return {
    subject: `Recordatorio de pago: ${a.name}`,
    html: layout(
      a.name,
      `<p>¡Hola, ${esc(r.first_name)}! Ya se acerca <b>${esc(a.name)}</b> (${esc(activityDateText(a))}).</p>
<p>Según nuestros registros tienes un balance pendiente de <b>${formatCents(balanceCents(a, r))}</b>.</p>
${paymentBlock(a)}
<p>Si ya pagaste, no te preocupes: puede que aún no lo hayamos anotado.</p>
${contactBlock(a)}`,
    ),
  };
}

export function eventReminderEmail(a: RegistrationEmailActivity, r: RegistrationEmailPerson) {
  const balance = balanceCents(a, r);
  return {
    subject: `¡Ya casi! ${a.name}`,
    html: layout(
      a.name,
      `<p>¡Hola, ${esc(r.first_name)}! Te esperamos en unos días.</p>
${detailsBlock(a)}
${a.what_to_bring ? `<p><b>Qué llevar</b><br>${para(a.what_to_bring)}</p>` : ""}
${balance > 0 ? `<p>Recuerda que tienes un balance pendiente de <b>${formatCents(balance)}</b>.</p>${paymentBlock(a)}` : ""}
${contactBlock(a)}`,
    ),
  };
}

export function organizerNoticeEmail(
  a: RegistrationEmailActivity,
  r: Pick<
    ActivityRegistrationRow,
    "first_name" | "last_name" | "phone" | "email" | "age" | "attends_church" | "church_name"
  >,
  opts: { needsReview: boolean; totalRegistered: number; appUrl: string },
) {
  const link = `${opts.appUrl}/actividades/${a.id}`;
  return {
    subject: `Nueva inscripción: ${r.first_name} ${r.last_name} — ${a.name}`,
    html: layout(
      "Nueva inscripción",
      `<p><b>${esc(r.first_name)} ${esc(r.last_name)}</b> se inscribió en <b>${esc(a.name)}</b>.</p>
<p><b>Teléfono:</b> ${esc(r.phone)}<br><b>Email:</b> ${esc(r.email)}<br><b>Edad:</b> ${r.age}<br>
<b>Persevera en una iglesia:</b> ${r.attends_church ? `Sí${r.church_name ? ` (${esc(r.church_name)})` : ""}` : "No"}</p>
${opts.needsReview ? `<p style="color:#9a3412"><b>Parece que ya existe en Personas.</b> Entra a la app para confirmar si es la misma persona.</p>` : ""}
<p>Inscritos hasta ahora: <b>${opts.totalRegistered}</b></p>
<p><a href="${esc(link)}" style="color:#1D191A">Ver inscripciones en la app</a></p>`,
    ),
  };
}
