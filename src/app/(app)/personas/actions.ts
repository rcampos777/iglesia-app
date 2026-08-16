"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { personSchema } from "@/lib/validations/people";
import { findDuplicateCandidates, type DuplicateCandidate } from "@/lib/data/people";
import type { PersonInsert } from "@/types/database";

const PEOPLE_WRITE_ROLES = [
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

function toPersonInsert(data: ReturnType<typeof personSchema.parse>): PersonInsert {
  return {
    first_name: data.firstName,
    last_name: data.lastName,
    preferred_name: data.preferredName || null,
    birth_date: data.birthDate || null,
    gender: data.gender || null,
    email: data.email || null,
    phone: data.phone || null,
    address_line: data.addressLine || null,
    city: data.city || null,
    marital_status: data.maritalStatus || null,
    membership_status: data.membershipStatus,
    joined_at: data.joinedAt || null,
    notes: data.notes || null,
    photo_url: null,
  };
}

export interface CreatePersonResult {
  duplicates?: DuplicateCandidate[];
}

export async function createPersonAction(
  formData: FormData,
): Promise<ActionResult<CreatePersonResult>> {
  try {
    await requireRole([...PEOPLE_WRITE_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = personSchema.safeParse(raw);

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const confirmDuplicate = formData.get("confirmDuplicate") === "true";

  if (!confirmDuplicate && (parsed.data.email || parsed.data.phone)) {
    const duplicates = await findDuplicateCandidates({
      email: parsed.data.email || undefined,
      phone: parsed.data.phone || undefined,
    });

    if (duplicates.length > 0) {
      // No es un error: requiere confirmación humana antes de crear un
      // posible duplicado (nunca se fusiona/crea automáticamente).
      return actionOk({ duplicates });
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person, error } = await supabase
    .from("people")
    .insert({ ...toPersonInsert(parsed.data), created_by: user?.id ?? null })
    .select("id")
    .single();

  if (error || !person) {
    return actionError(`No se pudo crear la persona: ${error?.message ?? "error desconocido"}`);
  }

  revalidatePath("/personas");
  redirect(`/personas/${person.id}`);
}

export async function updatePersonAction(
  personId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireRole([...PEOPLE_WRITE_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = personSchema.safeParse(raw);

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("people")
    .update({ ...toPersonInsert(parsed.data), updated_by: user?.id ?? null })
    .eq("id", personId);

  if (error) {
    return actionError(`No se pudo guardar: ${error.message}`);
  }

  revalidatePath("/personas");
  revalidatePath(`/personas/${personId}`);
  return actionOk(undefined);
}
