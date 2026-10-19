import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  DonationImportBatchRow,
  DonationImportDonorListItem,
  DonationImportRowRow,
  DonationImportSummary,
  FinanceLinkSuggestion,
} from "@/types/database";

/**
 * Importación de donaciones y donantes de Finanzas (0053). Las tablas de
 * staging solo las lee Finanzas (RLS) y solo cambian por funciones de la
 * base; los nombres de personas salen de funciones (Finanzas no lee
 * `people` directo).
 */

export async function listDonationImportBatches(): Promise<DonationImportBatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("donation_import_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDonationImportBatch(id: string): Promise<DonationImportBatchRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("donation_import_batches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getDonationImportSummary(id: string): Promise<DonationImportSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_import_summary", { p_batch_id: id });
  if (error || !data) throw new Error(error?.message ?? "Sin datos");
  return data;
}

export async function getDonationImportDonors(id: string): Promise<DonationImportDonorListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_import_donor_list", { p_batch_id: id });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDonationImportUnmapped(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_import_unmapped", { p_batch_id: id });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type ImportProblemRow = Pick<
  DonationImportRowRow,
  | "id"
  | "row_number"
  | "donation_date"
  | "amount_cents"
  | "raw_type"
  | "raw_method"
  | "status"
  | "status_detail"
  | "raw"
>;

/** Filas omitidas o que parecen ya registradas (para revisar). */
export async function getDonationImportProblemRows(id: string): Promise<ImportProblemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("donation_import_rows")
    .select(
      "id, row_number, donation_date, amount_cents, raw_type, raw_method, status, status_detail, raw",
    )
    .eq("batch_id", id)
    .in("status", ["omitida", "posible_repetida"])
    .order("status")
    .order("row_number")
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportProblemRow[];
}

export async function getFinanceLinkSuggestions(): Promise<FinanceLinkSuggestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_donor_link_suggestions");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getFinancePersonInfo(personId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_person_info", { p_person_id: personId });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}
