"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireAuth, AuthError } from "@/lib/auth/require-role";
import {
  CONTROL_CHECKIN_ROLES,
  CORRECT_ATTENDANCE_ROLES,
  RECORD_ATTENDANCE_ROLES,
} from "@/lib/auth/attendance";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { attendanceErrorMessage } from "@/lib/attendance/rpc-error";
import { verifyCheckinToken, createCheckinToken } from "@/lib/checkin/token";
import type {
  AppRole,
  CheckinSearchResult,
  RecordAttendanceResult,
  ServiceAttendanceEntry,
  ServiceWithState,
} from "@/types/database";

// Cada acción valida el rol aquí (corte temprano) y la función SQL vuelve
// a validar la capacidad y la ventana de registro en la base: un permiso
// revocado deja de funcionar en la siguiente operación aunque la pantalla
// siga abierta.

const uuid = z.string().uuid();
const reasonSchema = z
  .string()
  .trim()
  .min(5, "Escribe el motivo (mínimo 5 caracteres).")
  .max(300, "Máximo 300 caracteres.");

async function guard(roles: AppRole[]): Promise<ActionResult<never> | null> {
  try {
    await requireRole(roles);
    return null;
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
}

export async function searchPeopleForCheckinAction(
  serviceId: string,
  query: string,
): Promise<ActionResult<CheckinSearchResult[]>> {
  const denied = await guard(RECORD_ATTENDANCE_ROLES);
  if (denied) return denied;
  if (!uuid.safeParse(serviceId).success) return actionError("Culto inválido.");
  const q = z.string().trim().max(80).safeParse(query);
  if (!q.success) return actionError("Búsqueda demasiado larga.");
  if (q.data.length < 2) return actionOk([]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_people_for_checkin", {
    p_service_id: serviceId,
    p_query: q.data,
    p_limit: 15,
  });
  if (error) return actionError(attendanceErrorMessage(error));
  return actionOk(data ?? []);
}

async function record(
  serviceId: string,
  personId: string,
  method: "manual" | "qr",
): Promise<ActionResult<RecordAttendanceResult>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_service_attendance", {
    p_service_id: serviceId,
    p_person_id: personId,
    p_method: method,
  });
  if (error || !data)
    return actionError(attendanceErrorMessage(error ?? { code: "", message: "" }));
  return actionOk(data);
}

export async function recordAttendanceAction(
  serviceId: string,
  personId: string,
): Promise<ActionResult<RecordAttendanceResult>> {
  const denied = await guard(RECORD_ATTENDANCE_ROLES);
  if (denied) return denied;
  if (!uuid.safeParse(serviceId).success || !uuid.safeParse(personId).success) {
    return actionError("Datos inválidos.");
  }
  return record(serviceId, personId, "manual");
}

const QR_ERRORS: Record<string, string> = {
  formato_invalido: "Ese código no es un QR personal de la iglesia.",
  firma_invalida: "Código inválido. Pide a la persona que abra su QR en Mi portal.",
  expirado: "El código QR expiró. Pide a la persona que toque «Regenerar código».",
};

/**
 * El QR solo identifica a la persona (token firmado de corta vigencia,
 * validado aquí en el servidor); no concede permisos a quien lo escanea.
 */
export async function scanAttendanceAction(
  serviceId: string,
  token: string,
): Promise<ActionResult<RecordAttendanceResult>> {
  const denied = await guard(RECORD_ATTENDANCE_ROLES);
  if (denied) return denied;
  if (!uuid.safeParse(serviceId).success) return actionError("Culto inválido.");
  if (typeof token !== "string" || token.length > 300)
    return actionError(QR_ERRORS.formato_invalido!);

  const result = verifyCheckinToken(token.trim());
  if (!result.valid || !result.personId || !uuid.safeParse(result.personId).success) {
    return actionError(QR_ERRORS[result.reason ?? "formato_invalido"] ?? "Código inválido.");
  }
  return record(serviceId, result.personId, "qr");
}

export async function refreshAttendanceAction(
  serviceId: string,
): Promise<ActionResult<{ service: ServiceWithState | null; entries: ServiceAttendanceEntry[] }>> {
  const denied = await guard([...RECORD_ATTENDANCE_ROLES, ...CORRECT_ATTENDANCE_ROLES]);
  if (denied) return denied;
  if (!uuid.safeParse(serviceId).success) return actionError("Culto inválido.");

  const supabase = await createClient();
  const [svc, list] = await Promise.all([
    supabase.rpc("list_services_with_state", { p_service_id: serviceId }),
    supabase.rpc("list_service_attendance", { p_service_id: serviceId, p_include_voided: true }),
  ]);
  if (svc.error) return actionError(attendanceErrorMessage(svc.error));
  if (list.error) return actionError(attendanceErrorMessage(list.error));
  return actionOk({ service: svc.data?.[0] ?? null, entries: list.data ?? [] });
}

export async function setCheckinStateAction(
  serviceId: string,
  state: "abierto" | "cerrado",
): Promise<ActionResult> {
  const denied = await guard(CONTROL_CHECKIN_ROLES);
  if (denied) return denied;
  if (!uuid.safeParse(serviceId).success || !["abierto", "cerrado"].includes(state)) {
    return actionError("Datos inválidos.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_service_checkin_state", {
    p_service_id: serviceId,
    p_state: state,
  });
  if (error) return actionError(attendanceErrorMessage(error));
  return actionOk(undefined);
}

export async function voidAttendanceAction(
  checkinId: string,
  reason: string,
): Promise<ActionResult> {
  const denied = await guard(CORRECT_ATTENDANCE_ROLES);
  if (denied) return denied;
  if (!uuid.safeParse(checkinId).success) return actionError("Registro inválido.");
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Motivo inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_service_attendance", {
    p_checkin_id: checkinId,
    p_reason: parsed.data,
  });
  if (error) return actionError(attendanceErrorMessage(error));
  return actionOk(undefined);
}

export async function correctionAddAction(
  serviceId: string,
  personId: string,
  reason: string,
): Promise<ActionResult<RecordAttendanceResult>> {
  const denied = await guard(CORRECT_ATTENDANCE_ROLES);
  if (denied) return denied;
  if (!uuid.safeParse(serviceId).success || !uuid.safeParse(personId).success) {
    return actionError("Datos inválidos.");
  }
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Motivo inválido.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("correct_attendance_add", {
    p_service_id: serviceId,
    p_person_id: personId,
    p_reason: parsed.data,
  });
  if (error || !data)
    return actionError(attendanceErrorMessage(error ?? { code: "", message: "" }));
  return actionOk(data);
}

/** QR personal del miembro (Mi portal). Solo lo identifica; no registra asistencia. */
export async function getMyCheckinTokenAction(): Promise<ActionResult<{ token: string }>> {
  const user = await (async () => {
    try {
      return await requireAuth();
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();

  if (!user?.personId) return actionError("No tienes un perfil de persona asociado.");

  return actionOk({ token: createCheckinToken(user.personId) });
}
