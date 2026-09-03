"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePrayerReader, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import type { PrayerStatus } from "@/types/database";

/**
 * Quién lee peticiones de oración ya NO es una lista fija de roles: es
 * `is_prayer_reader()` en la base (rol intercesor, administrador, o
 * líder del ministerio de intercesión). Ver 0020_prayer_access_scope.sql.
 */

export async function assignToMeAction(requestId: string): Promise<ActionResult> {
  const user = await (async () => {
    try {
      return await requirePrayerReader();
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!user) return actionError("No tienes permiso para esta acción.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("prayer_requests")
    .update({ assigned_to: user.userId })
    .eq("id", requestId);

  if (error) return actionError(`No se pudo asignar: ${error.message}`);

  revalidatePath(`/oracion/${requestId}`);
  revalidatePath("/oracion");
  return actionOk(undefined);
}

export async function updatePrayerStatusAction(
  requestId: string,
  status: PrayerStatus,
): Promise<ActionResult> {
  try {
    await requirePrayerReader();
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("prayer_requests").update({ status }).eq("id", requestId);

  if (error) return actionError(`No se pudo actualizar: ${error.message}`);

  revalidatePath(`/oracion/${requestId}`);
  revalidatePath("/oracion");
  return actionOk(undefined);
}
