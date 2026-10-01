import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  CertificationListRow,
  CertificationTypeRow,
  PersonCertificationRow,
} from "@/types/database";

// Solo apostol y finanzas: RLS (has_finance_access) y las funciones de
// 0042 cortan a cualquier otro aunque llegue aquí.

export async function listCertifications(personId?: string): Promise<CertificationListRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("certifications_list", {
    p_person_id: personId ?? null,
  });
  if (error) throw new Error(`No se pudieron cargar las certificaciones: ${error.message}`);
  return data ?? [];
}

export async function listCertificationTypes(): Promise<CertificationTypeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("certification_types")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar los tipos: ${error.message}`);
  return data ?? [];
}

export async function getCertification(
  id: string,
): Promise<{ row: PersonCertificationRow; personName: string } | null> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("person_certifications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la certificación: ${error.message}`);
  if (!row) return null;
  const { data: person } = await supabase.rpc("finance_get_person", {
    p_person_id: row.person_id,
  });
  return { row, personName: person?.[0]?.display_name ?? "Persona" };
}
