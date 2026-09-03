"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import type { AppRole } from "@/types/database";

const ADMIN_ROLES = ["administrador"] as const;

export async function grantRoleAction(targetUserId: string, role: AppRole): Promise<ActionResult> {
  const actor = await (async () => {
    try {
      return await requireRole([...ADMIN_ROLES]);
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!actor) return actionError("No tienes permiso para gestionar roles.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: targetUserId, role, granted_by: actor.userId });

  if (error && error.code !== "23505") {
    return actionError(`No se pudo otorgar el rol: ${error.message}`);
  }

  await supabase.rpc("log_audit_event", {
    p_action: "grant_role",
    p_entity_type: "user_roles",
    p_entity_id: targetUserId,
    p_metadata: { role },
  });

  revalidatePath("/admin");
  return actionOk(undefined);
}

export async function revokeRoleAction(targetUserId: string, role: AppRole): Promise<ActionResult> {
  const actor = await (async () => {
    try {
      return await requireRole([...ADMIN_ROLES]);
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!actor) return actionError("No tienes permiso para gestionar roles.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", targetUserId)
    .eq("role", role);

  if (error) return actionError(`No se pudo quitar el rol: ${error.message}`);

  await supabase.rpc("log_audit_event", {
    p_action: "revoke_role",
    p_entity_type: "user_roles",
    p_entity_id: targetUserId,
    p_metadata: { role },
  });

  revalidatePath("/admin");
  return actionOk(undefined);
}
