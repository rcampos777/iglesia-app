"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requireRole } from "@/lib/auth/require-role";
import { FINANCE_ROLES } from "@/lib/auth/finance";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { attendanceErrorMessage as dbErrorMessage } from "@/lib/attendance/rpc-error";
import { parseAmountToCents } from "@/lib/money";
import { churchDateKey } from "@/lib/datetime";
import { buildLetterSnapshot, letterDocumentCode } from "@/lib/finance/letter";
import { renderLetterPdf } from "@/lib/finance/letter-pdf";
import type { AppRole } from "@/types/database";

// Cada acción corta temprano si el usuario no tiene el rol, y la base
// vuelve a validar (has_finance_access / is_apostol) en cada llamada: un
// acceso revocado deja de funcionar aunque la pantalla siga abierta.
// Los mensajes de error nunca incluyen montos ni la petición de oración.

const uuid = z.string().uuid();
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const donationTypes = ["diezmo", "ofrenda", "semilla", "primicias"] as const;
const methods = ["efectivo", "ath", "credito", "ath_movil", "cheque", "giro"] as const;
const reason = z.string().trim().min(5, "Escribe el motivo (mínimo 5 caracteres).").max(300);

async function guard(roles: AppRole[] = FINANCE_ROLES): Promise<ActionResult<never> | null> {
  try {
    await requireRole(roles);
    return null;
  } catch (err) {
    if (err instanceof AuthError) return actionError("No tienes permiso para esta acción.");
    throw err;
  }
}

function issue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos.";
}

const donationFields = z
  .object({
    personId: z.string().uuid().nullable(),
    anonymous: z.boolean(),
    date: dateKey.refine((d) => d <= churchDateKey(), "La fecha no puede ser futura."),
    amount: z.string().max(20),
    type: z.enum(donationTypes, { message: "Elige el tipo." }),
    method: z.enum(methods, { message: "Elige la forma de pago." }),
    reference: z
      .string()
      .trim()
      .max(80, "Máximo 80 caracteres.")
      .refine(
        (r) => !/\d{13,}/.test(r.replace(/[\s-]/g, "")),
        "No escribas números de tarjeta en la referencia.",
      ),
  })
  .refine((v) => v.anonymous !== Boolean(v.personId), {
    message: "Elige una persona o marca la donación como anónima.",
  });

export type DonationFormInput = z.input<typeof donationFields>;

export async function searchFinancePeopleAction(
  query: string,
): Promise<ActionResult<{ person_id: string; display_name: string; hint: string | null }[]>> {
  const denied = await guard();
  if (denied) return denied;
  const q = z.string().trim().max(80).safeParse(query);
  if (!q.success || q.data.length < 2) return actionOk([]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_search_people", { p_query: q.data });
  if (error) return actionError(dbErrorMessage(error));
  return actionOk(data ?? []);
}

export async function createDonationAction(
  input: DonationFormInput & {
    idempotencyKey: string;
    prayer: string;
    share: boolean;
    shareAuthorized: boolean;
  },
): Promise<ActionResult<{ id: string; created: boolean }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = donationFields.safeParse(input);
  if (!parsed.success) return actionError(issue(parsed.error));
  if (!uuid.safeParse(input.idempotencyKey).success) return actionError("Recarga el formulario.");
  const cents = parseAmountToCents(parsed.data.amount);
  if (cents === null) return actionError("Escribe una cantidad válida, por ejemplo 25 o 25.50.");
  if (cents > 100_000_000) return actionError("La cantidad máxima es $1,000,000.00.");
  const prayer = typeof input.prayer === "string" ? input.prayer.trim() : "";
  if (prayer.length > 2000)
    return actionError("La petición es demasiado larga (máx. 2000 caracteres).");
  if (input.share && !input.shareAuthorized) {
    return actionError("Para compartir con intercesión, confirma que la persona lo autorizó.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_donation", {
    p_idempotency_key: input.idempotencyKey,
    p_person_id: parsed.data.anonymous ? null : parsed.data.personId,
    p_is_anonymous: parsed.data.anonymous,
    p_donation_date: parsed.data.date,
    p_amount_cents: cents,
    p_donation_type: parsed.data.type,
    p_payment_method: parsed.data.method,
    p_reference: parsed.data.reference || null,
    p_prayer_text: prayer || null,
    p_share_with_intercession: Boolean(input.share && prayer),
    p_share_authorized: Boolean(input.shareAuthorized),
  });
  if (error || !data) return actionError(dbErrorMessage(error ?? { code: "", message: "" }));
  revalidatePath("/finanzas");
  return actionOk(data);
}

export async function correctDonationAction(
  input: DonationFormInput & { donationId: string; version: number; reason: string },
): Promise<ActionResult<{ version: number }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = donationFields.safeParse(input);
  if (!parsed.success) return actionError(issue(parsed.error));
  const r = reason.safeParse(input.reason);
  if (!r.success) return actionError(issue(r.error));
  if (!uuid.safeParse(input.donationId).success || !Number.isInteger(input.version)) {
    return actionError("Datos inválidos.");
  }
  const cents = parseAmountToCents(parsed.data.amount);
  if (cents === null) return actionError("Escribe una cantidad válida, por ejemplo 25 o 25.50.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_donation", {
    p_donation_id: input.donationId,
    p_expected_version: input.version,
    p_person_id: parsed.data.anonymous ? null : parsed.data.personId,
    p_is_anonymous: parsed.data.anonymous,
    p_donation_date: parsed.data.date,
    p_amount_cents: cents,
    p_donation_type: parsed.data.type,
    p_payment_method: parsed.data.method,
    p_reference: parsed.data.reference || null,
    p_reason: r.data,
  });
  if (error) return actionError(dbErrorMessage(error));
  revalidatePath(`/finanzas/${input.donationId}`);
  revalidatePath("/finanzas");
  return actionOk({ version: Number(data) });
}

export async function voidDonationAction(
  donationId: string,
  version: number,
  why: string,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const r = reason.safeParse(why);
  if (!r.success) return actionError(issue(r.error));
  if (!uuid.safeParse(donationId).success || !Number.isInteger(version)) {
    return actionError("Datos inválidos.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_donation", {
    p_donation_id: donationId,
    p_expected_version: version,
    p_reason: r.data,
  });
  if (error) return actionError(dbErrorMessage(error));
  revalidatePath(`/finanzas/${donationId}`);
  revalidatePath("/finanzas");
  return actionOk(undefined);
}

/** Lectura auditada del texto del sobre (cada lectura queda registrada). */
export async function readPrayerNoteAction(donationId: string): Promise<
  ActionResult<{
    content: string;
    shared: boolean;
    shareAuthorizedAt: string | null;
    shareAuthorizedBy: string | null;
  } | null>
> {
  const denied = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(donationId).success) return actionError("Datos inválidos.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_donation_prayer_note", {
    p_donation_id: donationId,
  });
  if (error) return actionError(dbErrorMessage(error));
  const row = data?.[0];
  return actionOk(
    row
      ? {
          content: row.content,
          shared: row.shared,
          shareAuthorizedAt: row.share_authorized_at,
          shareAuthorizedBy: row.share_authorized_by_name,
        }
      : null,
  );
}

export async function sharePrayerNoteAction(
  donationId: string,
  authorized: boolean,
): Promise<ActionResult<{ status: string }>> {
  const denied = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(donationId).success) return actionError("Datos inválidos.");
  if (!authorized) return actionError("Confirma que la persona autorizó compartir su petición.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("share_donation_prayer_note", {
    p_donation_id: donationId,
    p_authorized: true,
  });
  if (error) return actionError(dbErrorMessage(error));
  revalidatePath(`/finanzas/${donationId}`);
  return actionOk({ status: String(data) });
}

const letterInput = z.object({
  personId: uuid,
  from: dateKey,
  to: dateKey,
  expectedTotalCents: z.number().int().nonnegative(),
  expectedCount: z.number().int().nonnegative(),
  expectedVersion: z.number().int().positive(),
  letterId: uuid,
});

/**
 * Emite una carta: el total lo recalcula la base y debe coincidir con la
 * vista previa revisada. Se guarda la instantánea y el PDF exacto.
 * `letterId` lo genera el formulario: un doble clic no emite dos.
 */
export async function issueLetterAction(
  input: z.input<typeof letterInput>,
): Promise<ActionResult<{ id: string }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = letterInput.safeParse(input);
  if (!parsed.success || parsed.data.from > parsed.data.to) return actionError("Período inválido.");
  const { personId, from, to, letterId } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_letter_data", {
    p_person_id: personId,
    p_from: from,
    p_to: to,
  });
  if (error || !data) return actionError(dbErrorMessage(error ?? { code: "", message: "" }));

  const code = letterDocumentCode(letterId, to, parsed.data.expectedVersion);
  const snapshot = buildLetterSnapshot({
    data: { ...data, next_version: parsed.data.expectedVersion },
    personId,
    from,
    to,
    documentCode: code,
    issuedAt: new Date(),
  });
  const pdf = await renderLetterPdf(snapshot);

  const { error: issueError } = await supabase.rpc("issue_donation_letter", {
    p_letter_id: letterId,
    p_person_id: personId,
    p_from: from,
    p_to: to,
    p_expected_total_cents: parsed.data.expectedTotalCents,
    p_expected_count: parsed.data.expectedCount,
    p_expected_version: parsed.data.expectedVersion,
    p_document_code: code,
    p_snapshot: snapshot,
    p_pdf_base64: Buffer.from(pdf).toString("base64"),
  });
  if (issueError) return actionError(dbErrorMessage(issueError));
  revalidatePath("/finanzas/cartas");
  return actionOk({ id: letterId });
}

export async function newLetterIdAction(): Promise<string> {
  return randomUUID();
}

const settingsInput = z.object({
  churchName: z.string().trim().min(1, "Escribe el nombre de la iglesia.").max(150),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(120),
  taxId: z.string().trim().max(40),
  recipient: z.string().trim().min(1, "Escribe el destinatario.").max(150),
  body: z.string().trim().min(1, "Escribe el texto de la carta.").max(3000),
  closing: z.string().trim().max(100),
  signerName: z.string().trim().max(120),
  signerTitle: z.string().trim().max(120),
  templateStatus: z.enum(["borrador", "aprobada"]),
});

export async function updateFinanceSettingsAction(
  input: z.input<typeof settingsInput>,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) return actionError(issue(parsed.error));
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_update_settings", {
    p_church_name: d.churchName,
    p_address: d.address || null,
    p_phone: d.phone || null,
    p_email: d.email || null,
    p_tax_id: d.taxId || null,
    p_letter_recipient: d.recipient,
    p_letter_body: d.body,
    p_letter_closing: d.closing,
    p_signer_name: d.signerName || null,
    p_signer_title: d.signerTitle || null,
    p_template_status: d.templateStatus,
  });
  if (error) return actionError(dbErrorMessage(error));
  revalidatePath("/finanzas/configuracion");
  revalidatePath("/finanzas/cartas");
  return actionOk(undefined);
}

export async function searchAccountsAction(
  query: string,
): Promise<
  ActionResult<{ user_id: string; display_name: string; email: string | null; roles: AppRole[] }[]>
> {
  const denied = await guard(["apostol"]);
  if (denied) return denied;
  const q = z.string().trim().max(80).safeParse(query);
  if (!q.success || q.data.length < 2) return actionOk([]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_search_accounts", { p_query: q.data });
  if (error) return actionError(dbErrorMessage(error));
  return actionOk(data ?? []);
}

export async function setFinancialRoleAction(
  userId: string,
  role: "apostol" | "finanzas",
  grant: boolean,
  why: string,
): Promise<ActionResult<{ result: string }>> {
  const denied = await guard(["apostol"]);
  if (denied) return denied;
  if (!uuid.safeParse(userId).success || !["apostol", "finanzas"].includes(role)) {
    return actionError("Datos inválidos.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apostol_set_financial_role", {
    p_user_id: userId,
    p_role: role,
    p_grant: grant,
    p_reason: why.trim().slice(0, 300) || null,
  });
  if (error) {
    if (/última cuenta/.test(error.message)) {
      return actionError("No se puede quitar el acceso Apóstol a la última cuenta que lo tiene.");
    }
    return actionError(dbErrorMessage(error));
  }
  revalidatePath("/finanzas/acceso");
  return actionOk({ result: String(data) });
}
