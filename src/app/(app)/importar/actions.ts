"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { createImportBatchFromCsv, promoteImportRow } from "@/lib/data/import";
import { importedPersonSchema } from "@/lib/validations/import";
import type { ImportRowDecision } from "@/types/database";

const IMPORT_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export async function uploadImportAction(formData: FormData): Promise<ActionResult> {
  const user = await (async () => {
    try {
      return await requireRole([...IMPORT_ROLES]);
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!user) return actionError("No tienes permiso para importar datos.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return actionError("Selecciona un archivo CSV.");
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return actionError(
      "Por ahora solo se soporta CSV. Si tu archivo es Excel o Access, expórtalo primero a CSV (ver docs/import-process.md).",
    );
  }

  const text = await file.text();

  let result;
  try {
    result = await createImportBatchFromCsv(text, file.name, "csv", user.userId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "No se pudo procesar el archivo.");
  }

  revalidatePath("/importar");
  redirect(`/importar/${result.batchId}`);
}

export async function createManualEntryAction(formData: FormData): Promise<ActionResult> {
  const user = await (async () => {
    try {
      return await requireRole([...IMPORT_ROLES]);
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!user) return actionError("No tienes permiso para registrar entradas manuales.");

  const raw = {
    first_name: String(formData.get("first_name") ?? ""),
    last_name: String(formData.get("last_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    birth_date: String(formData.get("birth_date") ?? ""),
    membership_status: String(formData.get("membership_status") ?? ""),
  };

  const parsed = importedPersonSchema.safeParse(raw);
  if (!parsed.success) {
    return actionError("Revisa los datos: " + parsed.error.issues.map((i) => i.message).join(", "));
  }

  const supabase = await createClient();

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      source_type: "manual",
      target_entity: "people",
      file_name: "Captura manual",
      status: "en_revision",
      total_rows: 1,
      created_by: user.userId,
    })
    .select("id")
    .single();

  if (batchError || !batch) return actionError("No se pudo registrar la captura.");

  const { error: rowError } = await supabase.from("import_rows").insert({
    batch_id: batch.id,
    row_number: 1,
    raw_data: raw,
    normalized_data: parsed.data,
    match_status: "nuevo",
  });

  if (rowError) return actionError("No se pudo guardar el registro.");

  revalidatePath("/importar");
  redirect(`/importar/${batch.id}`);
}

export async function reviewImportRowAction(
  rowId: string,
  batchId: string,
  decision: ImportRowDecision,
  targetPersonId?: string,
): Promise<ActionResult> {
  try {
    await requireRole([...IMPORT_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  try {
    await promoteImportRow(rowId, decision, targetPersonId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "No se pudo procesar la fila.");
  }

  revalidatePath(`/importar/${batchId}`);
  return actionOk(undefined);
}
