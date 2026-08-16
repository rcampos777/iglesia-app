"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import type { PrayerStatus } from "@/types/database";

const PRAYER_ROLES = ["intercesor", "pastor", "administrador"] as const;

export async function assignToMeAction(requestId: string): Promise<ActionResult> {
  const user = await (async () => {
    try {
      return await requireRole([...PRAYER_ROLES]);
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
    await requireRole([...PRAYER_ROLES]);
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
