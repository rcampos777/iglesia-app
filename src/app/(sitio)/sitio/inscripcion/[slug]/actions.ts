"use server";

import { createPublicClient } from "@/lib/supabase/public";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { publicRegistrationSchema } from "@/lib/validations/registrations";
import { notifyOrganizers, sendRegistrationConfirmation } from "@/lib/registrations/automations";

const ERRORS: Record<string, string> = {
  registration_closed: "Las inscripciones para esta actividad ya están cerradas.",
  activity_full: "Lo sentimos, ya no quedan espacios disponibles.",
  already_registered:
    "Ya recibimos una inscripción con ese correo electrónico. Si necesitas cambiar algo, comunícate con los organizadores.",
  minor: "La inscripción en línea es para mayores de 18 años. Comunícate con los organizadores.",
  terms: "Debes aceptar las condiciones para inscribirte.",
};

/** Tiempo mínimo entre que se abre la forma y se envía: los bots la llenan al instante. */
const MIN_FILL_MS = 3000;

export interface RegistrationDone {
  firstName: string;
  email: string;
}

export async function submitRegistrationAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult<RegistrationDone>> {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };

  // Trampa anti-spam: campo invisible y tiempo de llenado. Se responde
  // "éxito" para no darle pistas al bot, pero no se guarda nada.
  const elapsed = Number(str("elapsed"));
  if (str("website") || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    return actionOk({ firstName: str("firstName").trim(), email: str("email").trim() });
  }

  const parsed = publicRegistrationSchema.safeParse({
    firstName: str("firstName"),
    lastName: str("lastName"),
    address: str("address"),
    age: str("age"),
    phone: str("phone"),
    email: str("email"),
    emergencyName: str("emergencyName"),
    emergencyPhone: str("emergencyPhone"),
    attendsChurch: str("attendsChurch"),
    churchName: str("churchName"),
    hasMedicalCondition: str("hasMedicalCondition"),
    medicalDetails: str("medicalDetails"),
    acceptTerms: str("acceptTerms"),
  });
  if (!parsed.success) {
    const { fieldErrors } = parsed.error.flatten();
    const clean: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(fieldErrors)) if (v) clean[k] = v;
    return actionError("Revisa los campos marcados.", clean);
  }
  const d = parsed.data;

  // El público no escribe en tablas: la función valida cupo, fechas y
  // duplicados, y decide si crear la persona o dejarla para revisión.
  const db = createPublicClient();
  const { data, error } = await db.rpc("submit_activity_registration", {
    p_slug: slug,
    p_first_name: d.firstName,
    p_last_name: d.lastName,
    p_address: d.address,
    p_age: d.age,
    p_phone: d.phone,
    p_email: d.email,
    p_emergency_name: d.emergencyName,
    p_emergency_phone: d.emergencyPhone,
    p_attends_church: d.attendsChurch === "si",
    p_church_name: d.churchName || null,
    p_has_medical_condition: d.hasMedicalCondition === "si",
    p_medical_details: d.medicalDetails || null,
    p_accept_terms: true,
  });

  if (error || !data?.[0]) {
    const known = error ? ERRORS[error.message] : undefined;
    if (!known) console.error("[inscripcion]", error?.message);
    return actionError(
      known ?? "No pudimos completar la inscripción. Intenta de nuevo en unos minutos.",
    );
  }

  // La inscripción ya quedó guardada: si un email falla, queda registrado
  // en notification_log y se puede reenviar desde la app.
  const registrationId = data[0].registration_id;
  await Promise.allSettled([
    sendRegistrationConfirmation(registrationId),
    notifyOrganizers(registrationId),
  ]);

  return actionOk({ firstName: d.firstName, email: d.email });
}
