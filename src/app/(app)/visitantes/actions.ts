"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { createFollowUpSchema, followUpNoteSchema } from "@/lib/validations/visitors";
import type { FollowupStatus } from "@/types/database";

const FOLLOWUP_ROLES = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "seguimiento",
] as const;

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

export async function createFollowUpAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole([...FOLLOWUP_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = createFollowUpSchema.safeParse({
    personId: formData.get("personId"),
    assignedTo: formData.get("assignedTo"),
    firstVisitDate: formData.get("firstVisitDate"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("visitor_follow_ups")
    .insert({
      person_id: parsed.data.personId,
      assigned_to: parsed.data.assignedTo || user?.id || null,
      first_visit_date: parsed.data.firstVisitDate || null,
      due_date: parsed.data.dueDate || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return actionError(`No se pudo crear el seguimiento: ${error?.message}`);

  revalidatePath("/visitantes");
  redirect(`/visitantes/${data.id}`);
}

export async function updateFollowUpStatusAction(
  followUpId: string,
  status: FollowupStatus,
): Promise<ActionResult> {
  try {
    await requireRole([...FOLLOWUP_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("visitor_follow_ups")
    .update({ status })
    .eq("id", followUpId);

  if (error) return actionError(`No se pudo actualizar: ${error.message}`);

  revalidatePath(`/visitantes/${followUpId}`);
  revalidatePath("/visitantes");
  return actionOk(undefined);
}

export async function addFollowUpNoteAction(
  followUpId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireRole([...FOLLOWUP_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = followUpNoteSchema.safeParse({
    note: formData.get("note"),
    contactMethod: formData.get("contactMethod"),
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("follow_up_notes").insert({
    follow_up_id: followUpId,
    note: parsed.data.note,
    contact_method: parsed.data.contactMethod || null,
    created_by: user?.id ?? null,
  });

  if (error) return actionError(`No se pudo agregar la nota: ${error.message}`);

  revalidatePath(`/visitantes/${followUpId}`);
  return actionOk(undefined);
}
