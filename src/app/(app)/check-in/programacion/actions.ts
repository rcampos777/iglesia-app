"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { MANAGE_SERVICES_ROLES } from "@/lib/auth/attendance";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { attendanceErrorMessage } from "@/lib/attendance/rpc-error";

const serviceTypes = ["culto_general", "oracion", "jovenes", "ninos", "otro"] as const;
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const timeKey = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.");
const optionalMinutes = z
  .union([z.literal(""), z.coerce.number().int().min(1).max(1440)])
  .transform((v) => (v === "" ? null : v));

async function guard(): Promise<ActionResult<never> | null> {
  try {
    await requireRole(MANAGE_SERVICES_ROLES);
    return null;
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
}

function done() {
  revalidatePath("/check-in/programacion");
  revalidatePath("/check-in");
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revisa los datos.";
}

const specialSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre.").max(120),
  serviceType: z.enum(serviceTypes),
  date: dateKey,
  time: timeKey,
  location: z.string().trim().max(150),
  closesAfter: optionalMinutes,
});

export async function createSpecialServiceAction(input: {
  name: string;
  serviceType: string;
  date: string;
  time: string;
  location: string;
  closesAfter: string;
}): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = specialSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_special_service", {
    p_name: parsed.data.name,
    p_service_type: parsed.data.serviceType,
    p_local_date: parsed.data.date,
    p_local_time: parsed.data.time,
    p_location: parsed.data.location || null,
    p_closes_minutes_after: parsed.data.closesAfter,
  });
  if (error) return actionError(attendanceErrorMessage(error));
  done();
  return actionOk(undefined);
}

const idSchema = z.string().uuid();

export async function cancelServiceAction(
  serviceId: string,
  reason: string,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!idSchema.safeParse(serviceId).success) return actionError("Culto inválido.");
  const r = z.string().trim().max(300).safeParse(reason);
  if (!r.success) return actionError("Motivo demasiado largo.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_service", {
    p_service_id: serviceId,
    p_reason: r.data || null,
  });
  if (error) return actionError(attendanceErrorMessage(error));
  done();
  return actionOk(undefined);
}

export async function reinstateServiceAction(serviceId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!idSchema.safeParse(serviceId).success) return actionError("Culto inválido.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("reinstate_service", { p_service_id: serviceId });
  if (error) return actionError(attendanceErrorMessage(error));
  done();
  return actionOk(undefined);
}

const rescheduleSchema = z.object({
  serviceId: idSchema,
  date: dateKey,
  time: timeKey,
  reason: z.string().trim().max(300),
});

export async function rescheduleServiceAction(input: {
  serviceId: string;
  date: string;
  time: string;
  reason: string;
}): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.rpc("reschedule_service", {
    p_service_id: parsed.data.serviceId,
    p_local_date: parsed.data.date,
    p_local_time: parsed.data.time,
    p_reason: parsed.data.reason || null,
  });
  if (error) return actionError(attendanceErrorMessage(error));
  done();
  return actionOk(undefined);
}

const seriesSchema = z.discriminatedUnion("endSeries", [
  z.object({
    endSeries: z.literal(false),
    seriesId: idSchema,
    effectiveFrom: dateKey,
    name: z.string().trim().min(1, "Escribe el nombre.").max(120),
    serviceType: z.enum(serviceTypes),
    weekday: z.coerce.number().int().min(0).max(6),
    time: timeKey,
    location: z.string().trim().max(150),
    opensBefore: z.coerce.number().int().min(0, "Mínimo 0 minutos.").max(1440),
    closesAfter: optionalMinutes,
  }),
  z.object({ endSeries: z.literal(true), seriesId: idSchema, effectiveFrom: dateKey }),
]);

export type SeriesInput = z.input<typeof seriesSchema>;

export async function updateSeriesAction(
  input: SeriesInput,
): Promise<ActionResult<{ removed: number; kept: number; created: number }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = seriesSchema.safeParse(input);
  if (!parsed.success) return actionError(firstIssue(parsed.error));
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "update_service_series",
    d.endSeries
      ? {
          p_series_id: d.seriesId,
          p_effective_from: d.effectiveFrom,
          p_name: null,
          p_service_type: null,
          p_weekday: null,
          p_local_time: null,
          p_location: null,
          p_opens_minutes_before: null,
          p_closes_minutes_after: null,
          p_end_series: true,
        }
      : {
          p_series_id: d.seriesId,
          p_effective_from: d.effectiveFrom,
          p_name: d.name,
          p_service_type: d.serviceType,
          p_weekday: d.weekday,
          p_local_time: d.time,
          p_location: d.location || null,
          p_opens_minutes_before: d.opensBefore,
          p_closes_minutes_after: d.closesAfter,
        },
  );
  if (error || !data)
    return actionError(attendanceErrorMessage(error ?? { code: "", message: "" }));
  done();
  return actionOk({ removed: data.removed, kept: data.kept, created: data.created });
}

export async function updateHorizonAction(weeks: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = z.coerce.number().int().min(1).max(26).safeParse(weeks);
  if (!parsed.success) return actionError("El horizonte debe estar entre 1 y 26 semanas.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_service_schedule_settings", {
    p_horizon_weeks: parsed.data,
  });
  if (error) return actionError(attendanceErrorMessage(error));
  done();
  return actionOk(undefined);
}
