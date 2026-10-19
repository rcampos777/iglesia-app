"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
  acknowledgedSchema,
  mergeSchema,
  quickPersonSchema,
  requestKeySchema,
  toPersonData,
  type QuickPersonInput,
} from "@/lib/validations/person-registry";
import { findPersonMatches } from "@/lib/data/person-registry";
import { isMatchesError, registryErrorMessage } from "@/lib/person-registry-errors";
import type { PersonMatch } from "@/types/database";
import { z } from "zod";

const REGISTER_ROLES = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "seguimiento",
] as const;
const VISIT_ROLES = ["administrador", "coordinador_ministerio", "seguimiento"] as const;
const DIRECTORY_ROLES = [
  "administrador",
  "seguimiento",
  "intercesor",
  "coordinador_ministerio",
] as const;

export type QuickRegisterResult =
  | { status: "matches"; matches: PersonMatch[] }
  | { status: "created"; personId: string; name: string };

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(error.flatten().fieldErrors)) {
    if (Array.isArray(v) && v.length) out[k] = v as string[];
  }
  return out;
}

/**
 * Alta rápida (Visitantes y otros flujos que solo piden lo mínimo). Si hay
 * coincidencias que la persona no ha revisado, las devuelve en vez de
 * crear; con `acknowledged` = las que vio y descartó, crea. La clave del
 * envío evita duplicar si se envía dos veces.
 */
export async function quickRegisterPersonAction(
  context: "directorio" | "visita",
  input: QuickPersonInput,
  acknowledged: string[],
  requestKey: string,
): Promise<ActionResult<QuickRegisterResult>> {
  try {
    await requireRole([...(context === "visita" ? VISIT_ROLES : REGISTER_ROLES)]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const parsed = quickPersonSchema.safeParse(input);
  if (!parsed.success) return actionError("Revisa los datos.", fieldErrors(parsed.error));
  const key = requestKeySchema.safeParse(requestKey);
  const ack = acknowledgedSchema.safeParse(acknowledged);
  if (!key.success || !ack.success) return actionError("Envío inválido. Recarga la página.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_person", {
    p_context: context,
    p_data: toPersonData(parsed.data),
    p_acknowledged: ack.data,
    p_request_key: key.data,
  });
  if (error) {
    if (isMatchesError(error.message)) {
      const matches = await findPersonMatches("directorio", null, parsed.data);
      return actionOk({ status: "matches", matches });
    }
    return actionError(registryErrorMessage(error, "No se pudo registrar a la persona."));
  }

  revalidatePath("/personas");
  return actionOk({
    status: "created",
    personId: data,
    name: `${parsed.data.firstName} ${parsed.data.lastName ?? ""}`.trim(),
  });
}

/** "No son la misma persona": la pareja deja de sugerirse. */
export async function dismissDuplicateAction(
  a: string,
  b: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await requireRole([...DIRECTORY_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const ids = z.array(z.string().uuid()).length(2).safeParse([a, b]);
  if (!ids.success) return actionError("Pareja inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("person_duplicate_dismiss", {
    p_a: a,
    p_b: b,
    p_reason: reason.trim().slice(0, 300),
  });
  if (error) return actionError(registryErrorMessage(error, "No se pudo guardar."));
  revalidatePath("/personas/duplicados");
  return actionOk(undefined);
}

export async function mergePeopleAction(input: {
  survivorId: string;
  mergedId: string;
  reason: string;
  takeFromMerged: string[];
}): Promise<ActionResult<{ survivorId: string }>> {
  try {
    await requireRole(["administrador"]);
  } catch (err) {
    if (err instanceof AuthError) return actionError("Solo un administrador puede unificar.");
    throw err;
  }
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("person_merge", {
    p_survivor: parsed.data.survivorId,
    p_merged: parsed.data.mergedId,
    p_reason: parsed.data.reason,
    p_take_from_merged: parsed.data.takeFromMerged,
  });
  if (error) {
    return actionError(registryErrorMessage(error, "No se pudo unificar. No se cambió nada."));
  }
  revalidatePath("/personas");
  revalidatePath("/personas/duplicados");
  revalidatePath(`/personas/${parsed.data.survivorId}`);
  return actionOk({ survivorId: parsed.data.survivorId });
}

export async function resolveIdentityReviewAction(
  requestId: string,
  targetPersonId: string | null,
  note: string,
): Promise<ActionResult> {
  try {
    await requireRole(["administrador"]);
  } catch (err) {
    if (err instanceof AuthError) return actionError("Solo un administrador puede vincular.");
    throw err;
  }
  const ids = z
    .object({
      requestId: z.string().uuid(),
      target: z.string().uuid().nullable(),
      note: z.string().trim().min(5, "Escribe cómo se verificó (mínimo 5 caracteres).").max(300),
    })
    .safeParse({ requestId, target: targetPersonId, note });
  if (!ids.success) return actionError(ids.error.issues[0]?.message ?? "Revisa los datos.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("identity_review_resolve", {
    p_request_id: ids.data.requestId,
    p_target_person_id: ids.data.target,
    p_note: ids.data.note,
  });
  if (error) return actionError(registryErrorMessage(error, "No se pudo resolver la solicitud."));
  revalidatePath("/personas/vinculaciones");
  return actionOk(undefined);
}
