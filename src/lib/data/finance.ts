import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  DonationDetail,
  DonationLetterListItem,
  DonationListItem,
  DonationTotals,
  FinanceSettingsRow,
  LetterData,
} from "@/types/database";
import type { DonationFilters } from "@/lib/finance/filters";

/**
 * Acceso a datos financieros. Todo pasa por funciones de la base que
 * validan `has_finance_access()`: aunque un componente llamara esto sin
 * permiso, la base respondería "No autorizado." sin datos.
 */

function rpcFilters(f: DonationFilters) {
  return {
    p_from: f.from,
    p_to: f.to,
    p_person_id: f.personId,
    p_type: f.type,
    p_method: f.method,
    p_identity: f.identity,
  };
}

export async function listDonations(
  f: DonationFilters,
  limit: number,
  offset: number,
): Promise<{ rows: DonationListItem[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_list_donations", {
    ...rpcFilters(f),
    p_status: f.status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}

export async function getDonationTotals(f: DonationFilters): Promise<DonationTotals> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_donation_totals", rpcFilters(f));
  if (error || !data) throw new Error(error?.message ?? "Sin datos");
  return data;
}

export async function getDonation(id: string): Promise<DonationDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_get_donation", { p_donation_id: id });
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getDonorYearly(personId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_donor_yearly", { p_person_id: personId });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPersonName(personId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_get_person", { p_person_id: personId });
  if (error) throw new Error(error.message);
  return data?.[0]?.display_name ?? null;
}

export async function getLetterData(
  personId: string,
  from: string,
  to: string,
): Promise<LetterData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_letter_data", {
    p_person_id: personId,
    p_from: from,
    p_to: to,
  });
  if (error || !data) throw new Error(error?.message ?? "Sin datos");
  return data;
}

export async function listLetters(personId?: string): Promise<DonationLetterListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_donation_letters", {
    p_person_id: personId ?? null,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getFinanceSettings(): Promise<FinanceSettingsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("finance_settings").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listFinanceRoleHolders() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finance_list_role_holders");
  if (error) throw new Error(error.message);
  return data ?? [];
}
