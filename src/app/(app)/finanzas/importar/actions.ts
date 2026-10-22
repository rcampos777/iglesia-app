"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Papa from "papaparse";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requireRole } from "@/lib/auth/require-role";
import { FINANCE_ROLES } from "@/lib/auth/finance";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { attendanceErrorMessage as dbErrorMessage } from "@/lib/attendance/rpc-error";
import { churchDateKey } from "@/lib/datetime";
import { readXlsx, XlsxError } from "@/lib/xlsx";
import {
  interpretDonationTable,
  type InterpretResult,
  type TableRow,
} from "@/lib/finance/import-parse";
import type { DonationImportPromoteResult } from "@/types/database";

// La base vuelve a validar el acceso (has_finance_access) en cada función.
// Los mensajes nunca incluyen montos ni nombres del archivo.

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const uuid = z.string().uuid();

async function guard(): Promise<ActionResult<never> | null> {
  try {
    await requireRole(FINANCE_ROLES);
    return null;
  } catch (err) {
    if (err instanceof AuthError) return actionError("No tienes permiso para esta acción.");
    throw err;
  }
}

function fail(error: { code?: string; message: string } | null): ActionResult<never> {
  // 57014 = límite de tiempo de la base (Supabase corta a ~8 s).
  if (error?.code === "57014") {
    return actionError(
      "La importación tardó demasiado y se detuvo sin guardar esta tanda. Intenta de nuevo; si se repite, avisa al administrador.",
    );
  }
  if (error) console.error("[finanzas/importar]", error.code, error.message);
  return actionError(dbErrorMessage({ code: error?.code ?? "", message: error?.message ?? "" }));
}

function interpretFile(name: string, buf: Buffer): InterpretResult {
  const today = churchDateKey();
  if (name.endsWith(".xlsx")) {
    const { sheets, date1904 } = readXlsx(buf);
    let firstError: string | null = null;
    // La primera hoja con encabezados de donaciones (las de resumen se ignoran).
    for (const sheet of sheets) {
      const res = interpretDonationTable(sheet.rows, { today, date1904 });
      if (res.ok) return { ...res, sheetName: sheet.name };
      firstError ??= res.error;
    }
    return { ok: false, error: firstError ?? "El archivo no tiene hojas." };
  }
  const parsed = Papa.parse<string[]>(buf.toString("utf8").replace(/^﻿/, ""), {
    skipEmptyLines: false,
  });
  const table: TableRow[] = parsed.data.map((cells, i) => ({
    rowNumber: i + 1,
    cells: cells.map((c) => (c === "" ? null : c)),
  }));
  return interpretDonationTable(table, { today });
}

export async function uploadDonationFileAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return actionError("Selecciona un archivo.");
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
    return actionError("Sube un archivo de Excel (.xlsx) o CSV.");
  }
  if (file.size > MAX_FILE_BYTES) return actionError("El archivo pasa de 8 MB.");

  let result: InterpretResult;
  try {
    result = interpretFile(name, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof XlsxError) return actionError(err.message);
    return actionError("No se pudo leer el archivo. Ábrelo en Excel y guárdalo de nuevo.");
  }
  if (!result.ok) return actionError(result.error);
  if (result.rows.length > 20000) return actionError("Máximo 20,000 filas por archivo.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_import_create_batch", {
    p_file_name: file.name.slice(0, 200),
    p_rows: result.rows,
  });
  if (error || !data) return fail(error);
  revalidatePath("/finanzas/importar");
  redirect(`/finanzas/importar/${data}`);
}

const decideInput = z.object({
  batchId: uuid,
  donorId: uuid,
  decision: z.enum(["pendiente", "enlazar", "crear", "anonima", "omitir", "unir"]),
  personId: uuid.nullable().optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  sameAsDonorId: uuid.nullable().optional(),
});

export async function decideDonorAction(input: z.input<typeof decideInput>): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = decideInput.safeParse(input);
  if (!parsed.success) return actionError("Revisa los datos.");
  const d = parsed.data;
  if (d.decision === "crear" && !d.firstName) return actionError("Escribe el nombre.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_import_decide", {
    p_donor_id: d.donorId,
    p_decision: d.decision,
    p_person_id: d.decision === "enlazar" ? (d.personId ?? null) : null,
    p_first_name: d.decision === "crear" ? (d.firstName ?? null) : null,
    p_last_name: d.decision === "crear" ? (d.lastName ?? "") : null,
    p_same_as_donor_id: d.decision === "unir" ? (d.sameAsDonorId ?? null) : null,
  });
  if (error) return fail(error);
  revalidatePath(`/finanzas/importar/${d.batchId}`);
  return actionOk(undefined);
}

export async function bulkDecideAction(
  batchId: string,
  action: "sugerencias" | "crear_sin_coincidencia",
): Promise<ActionResult<number>> {
  const denied = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(batchId).success) return actionError("Lote inválido.");
  if (action !== "sugerencias" && action !== "crear_sin_coincidencia") {
    return actionError("Acción inválida.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_import_bulk_decide", {
    p_batch_id: batchId,
    p_action: action,
  });
  if (error) return fail(error);
  revalidatePath(`/finanzas/importar/${batchId}`);
  return actionOk(data ?? 0);
}

const mapInput = z.object({
  batchId: uuid,
  field: z.enum(["tipo", "forma"]),
  raw: z.string().max(80),
  value: z.string().max(20),
});

export async function mapValueAction(input: z.input<typeof mapInput>): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = mapInput.safeParse(input);
  if (!parsed.success) return actionError("Revisa los datos.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_import_map_value", {
    p_batch_id: parsed.data.batchId,
    p_field: parsed.data.field,
    p_raw: parsed.data.raw,
    p_value: parsed.data.value,
  });
  if (error) return fail(error);
  revalidatePath(`/finanzas/importar/${parsed.data.batchId}`);
  return actionOk(undefined);
}

/** Importa por tandas hasta terminar (cada tanda es una transacción). */
export async function promoteBatchAction(
  batchId: string,
): Promise<ActionResult<DonationImportPromoteResult>> {
  const denied = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(batchId).success) return actionError("Lote inválido.");
  const supabase = await createClient();
  const total: DonationImportPromoteResult = {
    imported: 0,
    skipped: 0,
    repeated: 0,
    remaining: 0,
    review: 0,
  };
  for (let i = 0; i < 200; i++) {
    const { data, error } = await supabase.rpc("finance_import_promote", {
      p_batch_id: batchId,
      p_limit: 250,
    });
    if (error || !data) {
      revalidatePath(`/finanzas/importar/${batchId}`);
      if (total.imported > 0) {
        return actionError(
          `Se importaron ${total.imported} donaciones y luego hubo un error: ${dbErrorMessage({ code: error?.code ?? "", message: error?.message ?? "" })} Puedes continuar desde esta pantalla.`,
        );
      }
      return fail(error);
    }
    total.imported += data.imported;
    total.skipped += data.skipped;
    total.repeated += data.repeated;
    total.remaining = data.remaining;
    total.review = data.review;
    if (data.remaining === 0) break;
  }
  revalidatePath(`/finanzas/importar/${batchId}`);
  revalidatePath("/finanzas");
  return actionOk(total);
}

export async function resolveRepeatsAction(
  batchId: string,
  rowId: string | null,
  include: boolean,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(batchId).success || (rowId !== null && !uuid.safeParse(rowId).success)) {
    return actionError("Datos inválidos.");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_import_resolve_repeats", {
    p_batch_id: batchId,
    p_row_id: rowId,
    p_include: include,
  });
  if (error) return fail(error);
  revalidatePath(`/finanzas/importar/${batchId}`);
  return actionOk(undefined);
}

export async function discardBatchAction(batchId: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(batchId).success) return actionError("Lote inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finance_import_discard", { p_batch_id: batchId });
  if (error) return fail(error);
  revalidatePath("/finanzas/importar");
  revalidatePath(`/finanzas/importar/${batchId}`);
  return actionOk(undefined);
}
