"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
  activitySchema,
  activityParticipantSchema,
  NO_MINISTRY_VALUE,
} from "@/lib/validations/activities";

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

/**
 * Radix Select no admite un item con value="", así que las opciones
 * "ninguno" viajan con un centinela que aquí se normaliza a "".
 */
function optionalId(formData: FormData, field: string): string {
  const raw = formData.get(field);
  return typeof raw === "string" && raw !== NO_MINISTRY_VALUE ? raw : "";
}

function parseActivity(formData: FormData) {
  return activitySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    ministryId: optionalId(formData, "ministryId"),
    activityDate: formData.get("activityDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    location: formData.get("location"),
    capacity: formData.get("capacity"),
    responsiblePersonId: optionalId(formData, "responsiblePersonId"),
    status: formData.get("status"),
  });
}

/**
 * Espeja `can_manage_activity()` de la base: roles globales de
 * ministerios, o el líder del ministerio dueño de la actividad. El
 * `pastor` entra solo por la segunda vía. Defensa en profundidad, no
 * reemplazo de la RLS (docs/security.md).
 */
async function requireActivityManager(ministryId: string | null) {
  await requireAuth();
  const supabase = await createClient();
  const { data: canManage } = await supabase.rpc("can_manage_activity", {
    p_ministry_id: ministryId,
  });
  if (!canManage) {
    throw new AuthError("No tienes permiso para gestionar esta actividad.");
  }
}

async function ministryOfActivity(activityId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("ministry_id")
    .eq("id", activityId)
    .maybeSingle();
  return data?.ministry_id ?? null;
}

export async function createActivityAction(formData: FormData): Promise<ActionResult> {
  const parsed = parseActivity(formData);
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const ministryId = parsed.data.ministryId || null;
  try {
    await requireActivityManager(ministryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("activities")
    .insert({
      ministry_id: ministryId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      activity_date: parsed.data.activityDate,
      start_time: parsed.data.startTime || null,
      end_time: parsed.data.endTime || null,
      location: parsed.data.location || null,
      capacity: parsed.data.capacity ? Number(parsed.data.capacity) : null,
      status: parsed.data.status,
      responsible_person_id: parsed.data.responsiblePersonId || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return actionError(`No se pudo crear la actividad: ${error?.message}`);

  revalidatePath("/actividades");
  redirect(`/actividades/${data.id}`);
}

export async function updateActivityAction(
  activityId: string,
  formData: FormData,
): Promise<ActionResult<string | undefined>> {
  const parsed = parseActivity(formData);
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const newMinistryId = parsed.data.ministryId || null;
  try {
    // Hay que poder gestionar la actividad TAL COMO ESTÁ y también como
    // quedaría: si no, un líder podría mover una actividad a otro
    // ministerio (o sacarla del suyo) y perder/ganar control indebido.
    await requireActivityManager(await ministryOfActivity(activityId));
    await requireActivityManager(newMinistryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("activities")
    .update({
      ministry_id: newMinistryId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      activity_date: parsed.data.activityDate,
      start_time: parsed.data.startTime || null,
      end_time: parsed.data.endTime || null,
      location: parsed.data.location || null,
      capacity: parsed.data.capacity ? Number(parsed.data.capacity) : null,
      status: parsed.data.status,
      responsible_person_id: parsed.data.responsiblePersonId || null,
    })
    .eq("id", activityId);

  if (error) return actionError(`No se pudo actualizar: ${error.message}`);

  revalidatePath("/actividades");
  revalidatePath(`/actividades/${activityId}`);
  return actionOk("guardado");
}

export async function registerParticipantAction(
  activityId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireActivityManager(await ministryOfActivity(activityId));
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = activityParticipantSchema.safeParse({
    personId: formData.get("personId"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();

  // El cupo se comprueba aquí porque es una regla de negocio, no de
  // integridad: dos inscripciones simultáneas podrían pasarse por uno.
  // Para esta escala es aceptable; si llegara a importar, movería el
  // conteo a una función con bloqueo de fila.
  const { data: activity } = await supabase
    .from("activities")
    .select("capacity")
    .eq("id", activityId)
    .maybeSingle();

  if (activity?.capacity != null) {
    const { count } = await supabase
      .from("activity_participants")
      .select("id", { count: "exact", head: true })
      .eq("activity_id", activityId);
    if ((count ?? 0) >= activity.capacity) {
      return actionError(`La actividad ya alcanzó su cupo de ${activity.capacity} personas.`);
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("activity_participants").insert({
    activity_id: activityId,
    person_id: parsed.data.personId,
    notes: parsed.data.notes || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    if (error.code === "23505") return actionError("Esa persona ya está inscrita.");
    return actionError(`No se pudo inscribir: ${error.message}`);
  }

  revalidatePath(`/actividades/${activityId}`);
  return actionOk(undefined);
}

export async function setAttendanceAction(
  activityId: string,
  participantId: string,
  attended: boolean,
): Promise<ActionResult> {
  try {
    await requireActivityManager(await ministryOfActivity(activityId));
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("activity_participants")
    .update({ attended })
    .eq("id", participantId)
    .eq("activity_id", activityId);

  if (error) return actionError(`No se pudo registrar la asistencia: ${error.message}`);

  revalidatePath(`/actividades/${activityId}`);
  return actionOk(undefined);
}

export async function removeParticipantAction(
  activityId: string,
  participantId: string,
): Promise<ActionResult> {
  try {
    await requireActivityManager(await ministryOfActivity(activityId));
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("activity_participants")
    .delete()
    .eq("id", participantId)
    .eq("activity_id", activityId);

  if (error) return actionError(`No se pudo quitar a la persona: ${error.message}`);

  revalidatePath(`/actividades/${activityId}`);
  return actionOk(undefined);
}
