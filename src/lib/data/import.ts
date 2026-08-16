import "server-only";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import {
  importedPersonSchema,
  normalizeHeader,
  type ImportedPerson,
} from "@/lib/validations/import";
import type {
  ImportBatchRow,
  ImportRowDecision,
  ImportRowRow,
  ImportSourceType,
} from "@/types/database";

export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: Partial<ImportedPerson>;
  errors: string[];
}

export function parseCsv(text: string): ParsedRow[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  return result.data.map((raw, index) => {
    const normalized: Partial<ImportedPerson> = {};

    for (const [header, value] of Object.entries(raw)) {
      const field = normalizeHeader(header);
      if (field && typeof value === "string") {
        (normalized as Record<string, string>)[field] = value.trim();
      }
    }

    const parsed = importedPersonSchema.safeParse(normalized);
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

    return { rowNumber: index + 1, raw, normalized, errors };
  });
}

async function findMatchCandidates(
  row: Partial<ImportedPerson>,
): Promise<{ status: "nuevo" | "posible_duplicado" | "invalido"; candidateIds: string[] }> {
  if (!row.first_name || !row.last_name) {
    return { status: "invalido", candidateIds: [] };
  }

  const supabase = await createClient();
  const conditions: string[] = [];

  if (row.email) conditions.push(`email.eq.${row.email}`);
  if (row.phone) conditions.push(`phone.eq.${row.phone}`);
  if (row.birth_date) {
    conditions.push(
      `and(first_name.ilike.${row.first_name},last_name.ilike.${row.last_name},birth_date.eq.${row.birth_date})`,
    );
  }

  if (conditions.length === 0) {
    return { status: "nuevo", candidateIds: [] };
  }

  const { data, error } = await supabase.from("people").select("id").or(conditions.join(","));

  if (error) throw new Error(`Error al buscar duplicados: ${error.message}`);

  const ids = (data ?? []).map((p) => p.id);
  return { status: ids.length > 0 ? "posible_duplicado" : "nuevo", candidateIds: ids };
}

export async function createImportBatchFromCsv(
  fileText: string,
  fileName: string,
  sourceType: ImportSourceType,
  userId: string,
): Promise<{ batchId: string; rowCount: number }> {
  const supabase = await createClient();
  const parsedRows = parseCsv(fileText);

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      source_type: sourceType,
      target_entity: "people",
      file_name: fileName,
      status: "en_revision",
      total_rows: parsedRows.length,
      created_by: userId,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(`No se pudo crear el lote de importación: ${batchError?.message}`);
  }

  const rowsToInsert = [];
  for (const row of parsedRows) {
    const match =
      row.errors.length > 0
        ? { status: "invalido" as const, candidateIds: [] }
        : await findMatchCandidates(row.normalized);

    rowsToInsert.push({
      batch_id: batch.id,
      row_number: row.rowNumber,
      raw_data: row.raw,
      normalized_data: row.normalized,
      match_status: match.status,
      candidate_person_ids: match.candidateIds,
      validation_errors: row.errors,
    });
  }

  const { error: rowsError } = await supabase.from("import_rows").insert(rowsToInsert);
  if (rowsError) throw new Error(`No se pudieron guardar las filas: ${rowsError.message}`);

  return { batchId: batch.id, rowCount: parsedRows.length };
}

export async function listImportBatches(): Promise<ImportBatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface ImportRowWithCandidates extends ImportRowRow {
  candidateNames: { id: string; name: string }[];
}

export async function getImportBatchWithRows(
  batchId: string,
): Promise<{ batch: ImportBatchRow; rows: ImportRowWithCandidates[] } | null> {
  const supabase = await createClient();

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (batchError) throw new Error(batchError.message);
  if (!batch) return null;

  const { data: rows, error: rowsError } = await supabase
    .from("import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .order("row_number");
  if (rowsError) throw new Error(rowsError.message);

  const allCandidateIds = Array.from(new Set((rows ?? []).flatMap((r) => r.candidate_person_ids)));

  const { data: candidatePeople } = allCandidateIds.length
    ? await supabase.from("people").select("id, first_name, last_name").in("id", allCandidateIds)
    : { data: [] };

  const nameById = new Map(
    (candidatePeople ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]),
  );

  return {
    batch,
    rows: (rows ?? []).map((r) => ({
      ...r,
      candidateNames: r.candidate_person_ids.map((id) => ({ id, name: nameById.get(id) ?? id })),
    })),
  };
}

export async function promoteImportRow(
  rowId: string,
  decision: ImportRowDecision,
  targetPersonId?: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("promote_import_row", {
    p_row_id: rowId,
    p_decision: decision,
    p_target_person_id: targetPersonId ?? null,
  });

  if (error) throw new Error(`No se pudo procesar la fila: ${error.message}`);
  return data;
}
