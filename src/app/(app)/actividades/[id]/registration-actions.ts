"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { parseAmountToCents } from "@/lib/money";
import {
  registrationPaymentSchema,
  registrationSettingsSchema,
} from "@/lib/validations/registrations";
import { sendRegistrationConfirmation } from "@/lib/registrations/automations";

/** Espeja can_manage_activity() de la base (la RLS vuelve a comprobarlo). */
async function requireManager(activityId: string): Promise<ActionResult<never> | null> {
  try {
    await requireAuth();
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const supabase = await createClient();
  const { data: activity } = await supabase
    .from("activities")
    .select("ministry_id")
    .eq("id", activityId)
    .maybeSingle();
  if (!activity) return actionError("Actividad no encontrada.");
  const { data: canManage } = await supabase.rpc("can_manage_activity", {
    p_ministry_id: activity.ministry_id,
  });
  return canManage ? null : actionError("No tienes permiso para gestionar esta actividad.");
}

/** La inscripción tiene que ser de ESTA actividad (no se confía en el cliente). */
async function registrationOf(activityId: string, registrationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_registrations")
    .select("*")
    .eq("id", registrationId)
    .eq("activity_id", activityId)
    .maybeSingle();
  return data;
}

function done(activityId: string) {
  revalidatePath(`/actividades/${activityId}`);
}

export async function updateRegistrationSettingsAction(
  activityId: string,
  formData: FormData,
): Promise<ActionResult<string | undefined>> {
  const denied = await requireManager(activityId);
  if (denied) return denied;

  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = registrationSettingsSchema.safeParse({
    registrationOpen: get("registrationOpen"),
    registrationSlug: get("registrationSlug") ?? "",
    registrationClosesOn: get("registrationClosesOn") ?? "",
    price: get("price") ?? "",
    deposit: get("deposit") ?? "",
    paymentInstructions: get("paymentInstructions") ?? "",
    whatToBring: get("whatToBring") ?? "",
    contactInfo: get("contactInfo") ?? "",
    confirmationMessage: get("confirmationMessage") ?? "",
    flyerMediaId: get("flyerMediaId") === "none" ? "" : (get("flyerMediaId") ?? ""),
    notifyEmails: get("notifyEmails") ?? "",
  });
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    const clean: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(fieldErrors)) if (v) clean[k] = v;
    return actionError("Revisa los datos.", clean);
  }
  const d = parsed.data;
  const cents = (v: string | undefined) =>
    !v ? null : v.trim() === "0" ? 0 : parseAmountToCents(v);

  const supabase = await createClient();
  const { error } = await supabase
    .from("activities")
    .update({
      registration_open: Boolean(d.registrationOpen),
      registration_slug: d.registrationSlug || null,
      registration_closes_on: d.registrationClosesOn || null,
      price_cents: cents(d.price),
      deposit_cents: cents(d.deposit),
      payment_instructions: d.paymentInstructions || null,
      what_to_bring: d.whatToBring || null,
      contact_info: d.contactInfo || null,
      confirmation_message: d.confirmationMessage || null,
      flyer_media_id: d.flyerMediaId || null,
      notify_emails: d.notifyEmails,
    })
    .eq("id", activityId);

  if (error) {
    if (error.code === "23505") {
      return actionError("Esa dirección ya la usa otra actividad.", {
        registrationSlug: ["Esa dirección ya la usa otra actividad."],
      });
    }
    return actionError(`No se pudo guardar: ${error.message}`);
  }

  done(activityId);
  if (d.registrationSlug) revalidatePath(`/sitio/inscripcion/${d.registrationSlug}`);
  return actionOk("guardado");
}

export async function addRegistrationPaymentAction(
  activityId: string,
  registrationId: string,
  formData: FormData,
): Promise<ActionResult<string | undefined>> {
  const denied = await requireManager(activityId);
  if (denied) return denied;
  if (!(await registrationOf(activityId, registrationId))) {
    return actionError("Inscripción no encontrada.");
  }

  const parsed = registrationPaymentSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    paidOn: formData.get("paidOn"),
    reference: formData.get("reference") ?? "",
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Revisa los datos del pago.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("activity_registration_payments").insert({
    registration_id: registrationId,
    amount_cents: parseAmountToCents(parsed.data.amount)!,
    method: parsed.data.method,
    paid_on: parsed.data.paidOn,
    reference: parsed.data.reference || null,
    created_by: user?.id ?? null,
  });
  if (error) return actionError(`No se pudo registrar el pago: ${error.message}`);

  done(activityId);
  return actionOk("guardado");
}

export async function deleteRegistrationPaymentAction(
  activityId: string,
  registrationId: string,
  paymentId: string,
): Promise<ActionResult> {
  const denied = await requireManager(activityId);
  if (denied) return denied;
  if (!(await registrationOf(activityId, registrationId))) {
    return actionError("Inscripción no encontrada.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("activity_registration_payments")
    .delete()
    .eq("id", paymentId)
    .eq("registration_id", registrationId);
  if (error) return actionError(`No se pudo borrar el pago: ${error.message}`);

  done(activityId);
  return actionOk(undefined);
}

/** `personId` null = crear una persona nueva con los datos de la inscripción. */
export async function linkRegistrationAction(
  activityId: string,
  registrationId: string,
  personId: string | null,
): Promise<ActionResult> {
  const denied = await requireManager(activityId);
  if (denied) return denied;
  if (!(await registrationOf(activityId, registrationId))) {
    return actionError("Inscripción no encontrada.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("link_activity_registration", {
    p_registration_id: registrationId,
    p_person_id: personId,
  });
  if (error) return actionError(error.message);

  done(activityId);
  return actionOk(undefined);
}

export async function cancelRegistrationAction(
  activityId: string,
  registrationId: string,
): Promise<ActionResult> {
  const denied = await requireManager(activityId);
  if (denied) return denied;
  const reg = await registrationOf(activityId, registrationId);
  if (!reg) return actionError("Inscripción no encontrada.");
  if (reg.cancelled_at) return actionOk(undefined);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("activity_registrations")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null })
    .eq("id", registrationId);
  if (error) return actionError(`No se pudo cancelar: ${error.message}`);

  // Libera el cupo también en la lista de inscritos (si aún no asistió).
  if (reg.person_id) {
    await supabase
      .from("activity_participants")
      .delete()
      .eq("activity_id", activityId)
      .eq("person_id", reg.person_id)
      .eq("attended", false);
  }

  done(activityId);
  return actionOk(undefined);
}

export async function resendConfirmationAction(
  activityId: string,
  registrationId: string,
): Promise<ActionResult> {
  const denied = await requireManager(activityId);
  if (denied) return denied;
  const reg = await registrationOf(activityId, registrationId);
  if (!reg) return actionError("Inscripción no encontrada.");

  const res = await sendRegistrationConfirmation(registrationId);
  if (!res.ok) return actionError(`No se pudo enviar: ${res.error ?? "error desconocido"}`);
  return actionOk(undefined);
}
