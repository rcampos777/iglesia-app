"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole, AuthError } from "@/lib/auth/require-role";
import { hasAnyRole } from "@/lib/auth/session";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
  ministrySchema,
  ministryMembershipSchema,
  NO_LEADER_VALUE,
} from "@/lib/validations/ministries";
import type { MinistryMemberRole } from "@/types/database";

/** Quién puede crear/editar el catálogo de ministerios. */
const MINISTRY_ADMIN_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

function leaderPersonIdFrom(formData: FormData): string {
  const raw = formData.get("leaderPersonId");
  return typeof raw === "string" && raw !== NO_LEADER_VALUE ? raw : "";
}

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
 * La membresía de un ministerio la gestiona el staff de ministerios O el
 * líder de ESE ministerio (autorización por ámbito, no solo por rol
 * global). Espeja exactamente la política RLS `ministry_memberships_write`
 * — defensa en profundidad, no reemplazo (docs/security.md).
 */
async function requireMinistryManager(ministryId: string) {
  const user = await requireAuth();
  if (hasAnyRole(user, [...MINISTRY_ADMIN_ROLES])) return user;

  const supabase = await createClient();
  const { data: isLeader } = await supabase.rpc("is_ministry_leader", {
    p_ministry_id: ministryId,
  });
  if (!isLeader) {
    throw new AuthError("No tienes permiso para gestionar este ministerio.");
  }
  return user;
}

export async function createMinistryAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole([...MINISTRY_ADMIN_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = ministrySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    leaderPersonId: leaderPersonIdFrom(formData),
    meetingScheduleText: formData.get("meetingScheduleText"),
    location: formData.get("location"),
    isActive: formData.get("isActive") ?? "true",
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("ministries")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      leader_person_id: parsed.data.leaderPersonId || null,
      meeting_schedule_text: parsed.data.meetingScheduleText || null,
      location: parsed.data.location || null,
      is_active: parsed.data.isActive === "true",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return actionError("Ya existe un ministerio con ese nombre.");
    }
    return actionError(`No se pudo crear el ministerio: ${error?.message}`);
  }

  revalidatePath("/ministerios");
  redirect(`/ministerios/${data.id}`);
}

export async function updateMinistryAction(
  ministryId: string,
  formData: FormData,
): Promise<ActionResult<string | undefined>> {
  try {
    await requireRole([...MINISTRY_ADMIN_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = ministrySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    leaderPersonId: leaderPersonIdFrom(formData),
    meetingScheduleText: formData.get("meetingScheduleText"),
    location: formData.get("location"),
    isActive: formData.get("isActive") ?? "true",
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase
    .from("ministries")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      leader_person_id: parsed.data.leaderPersonId || null,
      meeting_schedule_text: parsed.data.meetingScheduleText || null,
      location: parsed.data.location || null,
      is_active: parsed.data.isActive === "true",
    })
    .eq("id", ministryId);

  if (error) {
    if (error.code === "23505") return actionError("Ya existe un ministerio con ese nombre.");
    return actionError(`No se pudo actualizar: ${error.message}`);
  }

  revalidatePath("/ministerios");
  revalidatePath(`/ministerios/${ministryId}`);
  return actionOk("guardado");
}

export async function addMinistryMemberAction(
  ministryId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireMinistryManager(ministryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = ministryMembershipSchema.safeParse({
    personId: formData.get("personId"),
    roleInMinistry: formData.get("roleInMinistry"),
    joinedAt: formData.get("joinedAt"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("ministry_memberships").insert({
    ministry_id: ministryId,
    person_id: parsed.data.personId,
    role_in_ministry: parsed.data.roleInMinistry,
    joined_at: parsed.data.joinedAt || new Date().toISOString().slice(0, 10),
    notes: parsed.data.notes || null,
    created_by: user?.id ?? null,
  });

  if (error) {
    // Índice parcial único: la persona ya sirve activamente aquí.
    if (error.code === "23505") {
      return actionError("Esa persona ya sirve en este ministerio.");
    }
    return actionError(`No se pudo agregar a la persona: ${error.message}`);
  }

  revalidatePath(`/ministerios/${ministryId}`);
  return actionOk(undefined);
}

export async function updateMemberRoleAction(
  ministryId: string,
  membershipId: string,
  role: MinistryMemberRole,
): Promise<ActionResult> {
  try {
    await requireMinistryManager(ministryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ministry_memberships")
    .update({ role_in_ministry: role })
    .eq("id", membershipId)
    .eq("ministry_id", ministryId);

  if (error) return actionError(`No se pudo actualizar: ${error.message}`);

  revalidatePath(`/ministerios/${ministryId}`);
  return actionOk(undefined);
}

/**
 * Salir del ministerio cierra la membresía (left_at), no borra la fila:
 * el histórico de servicio de la persona se conserva.
 */
export async function endMinistryMembershipAction(
  ministryId: string,
  membershipId: string,
): Promise<ActionResult> {
  try {
    await requireMinistryManager(ministryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ministry_memberships")
    .update({ left_at: new Date().toISOString().slice(0, 10) })
    .eq("id", membershipId)
    .eq("ministry_id", ministryId)
    .is("left_at", null);

  if (error) return actionError(`No se pudo cerrar la membresía: ${error.message}`);

  revalidatePath(`/ministerios/${ministryId}`);
  return actionOk(undefined);
}
