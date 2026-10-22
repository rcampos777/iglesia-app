"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requireRole } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { CONTACT_ROLES } from "@/lib/auth/session";

const input = z.object({ id: z.uuid(), status: z.enum(["nuevo", "atendido"]) });

export async function setContactStatusAction(raw: z.input<typeof input>): Promise<ActionResult> {
  let userId: string;
  try {
    userId = (await requireRole(CONTACT_ROLES)).userId;
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const p = input.safeParse(raw);
  if (!p.success) return actionError("Mensaje inválido.");
  const atendido = p.data.status === "atendido";
  const supabase = await createClient();
  // RLS (can_read_contact_messages) es la segunda barrera; el trigger impide
  // cambiar lo que escribió el visitante.
  const { data, error } = await supabase
    .from("site_contact_messages")
    .update({
      status: p.data.status,
      handled_at: atendido ? new Date().toISOString() : null,
      handled_by: atendido ? userId : null,
    })
    .eq("id", p.data.id)
    .select("id");
  if (error || !data?.length) return actionError("No se pudo actualizar el mensaje.");
  revalidatePath("/mensajes");
  return actionOk(undefined);
}
