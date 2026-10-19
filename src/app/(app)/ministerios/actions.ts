"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole, AuthError } from "@/lib/auth/require-role";
import { hasAnyRole, hasRole } from "@/lib/auth/session";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
  ministrySchema,
  ministryMembershipSchema,
  NO_LEADER_VALUE,
} from "@/lib/validations/ministries";
import type { MinistryImportDecision, MinistryMemberRole, PersonMatch } from "@/types/database";
import {
  acknowledgedSchema,
  ministryImportSchema,
  quickPersonSchema,
  requestKeySchema,
  toPersonData,
  type QuickPersonInput,
} from "@/lib/validations/person-registry";
import { findPersonMatches } from "@/lib/data/person-registry";
import { isMatchesError, registryErrorMessage } from "@/lib/person-registry-errors";
import { z } from "zod";

/**
 * Quién puede gestionar CUALQUIER ministerio. `pastor` ya no está aquí:
 * desde la decisión del 2026-09-02 solo gestiona los que él lidera (ver
 * docs/roles-and-permissions.md).
 */
const MINISTRY_GLOBAL_ROLES = ["administrador", "coordinador_ministerio"] as const;

/**
 * Quién puede crear un ministerio nuevo. `pastor` no está aquí a
 * propósito: el flujo documentado es que administrador/coordinador crea
 * el ministerio y LUEGO designa al pastor como líder — un pastor no
 * "lidera" algo que todavía no existe (docs/roles-and-permissions.md
 * §3: "el flujo previsto es: el administrador crea el ministerio, pone
 * al pastor como líder"). Antes incluía a pastor aquí sin que la RLS
 * (0018) tuviera ninguna vía acotada para el alta — ver
 * 0028_pastor_scope.sql.
 */
const MINISTRY_CREATE_ROLES = ["administrador", "coordinador_ministerio"] as const;

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
  if (hasAnyRole(user, [...MINISTRY_GLOBAL_ROLES])) return user;

  const supabase = await createClient();
  const { data: isLeader } = await supabase.rpc("is_ministry_leader", {
    p_ministry_id: ministryId,
  });
  if (!isLeader) {
    throw new AuthError("No tienes permiso para gestionar este ministerio.");
  }
  return user;
}

/**
 * Editar el REGISTRO del ministerio (nombre, líder, horario) es más que
 * gestionar su membresía: lo hacen los roles globales, y el pastor solo
 * sobre los ministerios que lidera.
 */
async function requireMinistryEditor(ministryId: string) {
  const user = await requireAuth();
  if (hasAnyRole(user, [...MINISTRY_GLOBAL_ROLES])) return user;

  if (hasRole(user, "pastor")) {
    const supabase = await createClient();
    const { data: isLeader } = await supabase.rpc("is_ministry_leader", {
      p_ministry_id: ministryId,
    });
    if (isLeader) return user;
  }

  throw new AuthError("No tienes permiso para editar este ministerio.");
}

export async function createMinistryAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole([...MINISTRY_CREATE_ROLES]);
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
    grantsPrayerAccess: formData.get("grantsPrayerAccess") ?? "false",
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));
  // Al crear, el líder (pastor) del ministerio es obligatorio (decisión 2026-10-01):
  // es quien después trabaja con su gente.
  if (!parsed.data.leaderPersonId) {
    return actionError("Elige al líder del ministerio.", {
      leaderPersonId: ["Elige al líder del ministerio."],
    });
  }

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
      // `grants_prayer_access` no se escribe aquí: el privilegio está
      // revocado en la base (0021) y se designa al editar, vía RPC.
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return actionError(
        "Ya existe un ministerio con ese nombre, o ya hay otro marcado como ministerio de intercesión.",
      );
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
  let actor;
  try {
    actor = await requireMinistryEditor(ministryId);
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
    grantsPrayerAccess: formData.get("grantsPrayerAccess") ?? "false",
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
    if (error.code === "23505") {
      return actionError(
        "Ya existe un ministerio con ese nombre, o ya hay otro marcado como ministerio de intercesión.",
      );
    }
    return actionError(`No se pudo actualizar: ${error.message}`);
  }

  // La marca de "ministerio de intercesión" va por una vía aparte: el
  // privilegio sobre la columna está revocado en la base y el RPC exige
  // rol administrador y deja registro en audit_log (0021).
  if (hasRole(actor, "administrador")) {
    const { error: prayerError } = await supabase.rpc("set_prayer_ministry", {
      p_ministry_id: ministryId,
      p_enabled: parsed.data.grantsPrayerAccess === "true",
    });
    if (prayerError) {
      return actionError(`No se pudo actualizar el acceso a oración: ${prayerError.message}`);
    }
  }

  revalidatePath("/ministerios");
  revalidatePath(`/ministerios/${ministryId}`);
  revalidatePath("/oracion");
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
    // Trigger de 0029: nadie que no sea administrador puede dar de alta
    // un lider/colider en el ministerio marcado como de intercesión.
    if (error.code === "42501") {
      return actionError(
        "Solo un administrador puede asignar líder o colíder en el ministerio de intercesión.",
      );
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

  if (error) {
    // Trigger de 0029: ascender a alguien a lider/colider en el
    // ministerio de intercesión es exclusivo de administrador.
    if (error.code === "42501") {
      return actionError(
        "Solo un administrador puede asignar líder o colíder en el ministerio de intercesión.",
      );
    }
    return actionError(`No se pudo actualizar: ${error.message}`);
  }

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

export type AddMinistryPersonResult =
  | { status: "matches"; matches: PersonMatch[] }
  | { status: "done"; membership: "agregada" | "ya_integrante"; personCreated: boolean };

/**
 * Integrante nuevo o existente con el flujo común (ministry_add_person,
 * 0054). Crea la persona sin cuenta: crear la cuenta, asignar el
 * ministerio y dar permisos son pasos separados.
 */
export async function addMinistryPersonAction(
  ministryId: string,
  target:
    { personId: string } | { input: QuickPersonInput; acknowledged: string[]; requestKey: string },
): Promise<ActionResult<AddMinistryPersonResult>> {
  try {
    await requireMinistryManager(ministryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  if (!z.string().uuid().safeParse(ministryId).success) return actionError("Ministerio inválido.");

  const supabase = await createClient();
  let args;
  let input: QuickPersonInput | null = null;
  if ("personId" in target) {
    if (!z.string().uuid().safeParse(target.personId).success) {
      return actionError("Persona inválida.");
    }
    args = {
      p_ministry_id: ministryId,
      p_person_id: target.personId,
      p_data: null,
      p_acknowledged: null,
      p_request_key: null,
    };
  } else {
    const parsed = quickPersonSchema.safeParse(target.input);
    if (!parsed.success) {
      const fe: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) {
        if (Array.isArray(v) && v.length) fe[k] = v as string[];
      }
      return actionError("Revisa los datos.", fe);
    }
    const key = requestKeySchema.safeParse(target.requestKey);
    const ack = acknowledgedSchema.safeParse(target.acknowledged);
    if (!key.success || !ack.success) return actionError("Envío inválido. Recarga la página.");
    input = parsed.data;
    args = {
      p_ministry_id: ministryId,
      p_person_id: null,
      p_data: toPersonData(parsed.data),
      p_acknowledged: ack.data,
      p_request_key: key.data,
    };
  }

  const { data, error } = await supabase.rpc("ministry_add_person", args);
  if (error) {
    if (input && isMatchesError(error.message)) {
      const matches = await findPersonMatches("ministerio", ministryId, input);
      return actionOk({ status: "matches", matches });
    }
    return actionError(registryErrorMessage(error, "No se pudo agregar a la persona."));
  }

  revalidatePath(`/ministerios/${ministryId}`);
  return actionOk({
    status: "done",
    membership: data.membership,
    personCreated: data.person_created,
  });
}

export async function createMinistryImportAction(
  ministryId: string,
  input: { fileName: string; rows: unknown },
): Promise<ActionResult<{ batchId: string }>> {
  try {
    await requireMinistryManager(ministryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const parsed = ministryImportSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "El archivo no es válido.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ministry_import_create_batch", {
    p_ministry_id: ministryId,
    p_file_name: parsed.data.fileName,
    p_rows: parsed.data.rows,
  });
  if (error || !data) {
    return actionError(registryErrorMessage(error, "No se pudo preparar la importación."));
  }
  return actionOk({ batchId: data });
}

const decisionSchema = z.enum(["pendiente", "usar_existente", "crear", "omitir"]);

export async function decideMinistryImportRowAction(
  ministryId: string,
  batchId: string,
  rowId: string,
  decision: MinistryImportDecision,
  personId: string | null,
): Promise<ActionResult> {
  try {
    await requireMinistryManager(ministryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const ok =
    z.string().uuid().safeParse(rowId).success &&
    decisionSchema.safeParse(decision).success &&
    (personId === null || z.string().uuid().safeParse(personId).success);
  if (!ok) return actionError("Decisión inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("ministry_import_decide", {
    p_row_id: rowId,
    p_decision: decision,
    p_person_id: personId,
  });
  if (error) return actionError(registryErrorMessage(error, "No se pudo guardar la decisión."));
  revalidatePath(`/ministerios/${ministryId}/importar/${batchId}`);
  return actionOk(undefined);
}

export async function applyMinistryImportAction(
  ministryId: string,
  batchId: string,
): Promise<
  ActionResult<{
    creadas: number;
    agregadas: number;
    ya_integrantes: number;
    omitidas: number;
    a_revisar: number;
    pendientes: number;
  }>
> {
  try {
    await requireMinistryManager(ministryId);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  if (!z.string().uuid().safeParse(batchId).success) return actionError("Lote inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ministry_import_apply", { p_batch_id: batchId });
  if (error || !data) {
    return actionError(registryErrorMessage(error, "No se pudo aplicar la importación."));
  }
  revalidatePath(`/ministerios/${ministryId}`);
  revalidatePath(`/ministerios/${ministryId}/importar/${batchId}`);
  return actionOk(data);
}
