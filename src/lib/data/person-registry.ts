import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  DuplicatePair,
  IdentityReviewItem,
  MergePreview,
  MinistryImportBatchRow,
  MinistryImportRowRow,
  PersonMatch,
} from "@/types/database";
import type { QuickPersonInput } from "@/lib/validations/person-registry";

export type MatchContext = "directorio" | "ministerio" | "finanzas";

/**
 * Coincidencias de una persona que se va a registrar, con el permiso del
 * módulo (la base decide qué devuelve: nombre, motivos y contacto
 * enmascarado). Nunca une ni crea.
 */
export async function findPersonMatches(
  context: MatchContext,
  ministryId: string | null,
  input: Partial<QuickPersonInput>,
): Promise<PersonMatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("person_matches", {
    p_context: context,
    p_ministry_id: ministryId,
    p_first: input.firstName ?? "",
    p_last: input.lastName ?? "",
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_birth: input.birthDate || null,
  });
  if (error) throw new Error(`No se pudieron buscar coincidencias: ${error.message}`);
  return data ?? [];
}

/** "Con cuenta" / "Sin cuenta", derivado de profiles (solo personas visibles). */
export async function getAccountStatus(
  personIds: string[],
): Promise<Map<string, { hasAccount: boolean; invitationPending: boolean }>> {
  const result = new Map<string, { hasAccount: boolean; invitationPending: boolean }>();
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return result;
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.rpc("people_account_status", {
      p_ids: ids.slice(i, i + 500),
    });
    if (error) throw new Error(`No se pudo cargar el estado de las cuentas: ${error.message}`);
    for (const r of data ?? []) {
      result.set(r.person_id, {
        hasAccount: r.has_account,
        invitationPending: r.invitation_pending,
      });
    }
  }
  return result;
}

export async function listDuplicatePairs(limit = 200): Promise<DuplicatePair[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("person_duplicate_pairs", { p_limit: limit });
  if (error) throw new Error(`No se pudieron cargar los posibles duplicados: ${error.message}`);
  return data ?? [];
}

export async function getMergePreview(
  survivorId: string,
  mergedId: string,
): Promise<MergePreview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("person_merge_preview", {
    p_survivor: survivorId,
    p_merged: mergedId,
  });
  if (error) {
    if (/no encontrada/i.test(error.message)) return null;
    throw new Error(`No se pudo preparar la unificación: ${error.message}`);
  }
  return data;
}

/** Id definitivo de una persona que se unificó con otra (o el mismo). */
export async function resolvePersonId(personId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("resolve_person_id", { p_person_id: personId });
  return data ?? null;
}

export async function listIdentityReviews(): Promise<IdentityReviewItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("identity_review_list");
  if (error) throw new Error(`No se pudieron cargar las solicitudes: ${error.message}`);
  return data ?? [];
}

export async function hasPendingIdentityReview(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_identity_review_pending");
  return Boolean(data);
}

export interface MinistryImport {
  batch: MinistryImportBatchRow;
  rows: MinistryImportRowRow[];
}

export async function getMinistryImport(batchId: string): Promise<MinistryImport | null> {
  const supabase = await createClient();
  const { data: batch, error } = await supabase
    .from("ministry_import_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la importación: ${error.message}`);
  if (!batch) return null;
  const { data: rows, error: rowsError } = await supabase
    .from("ministry_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .order("row_number");
  if (rowsError) throw new Error(`No se pudieron cargar las filas: ${rowsError.message}`);
  return { batch, rows: rows ?? [] };
}

export async function listMinistryImports(ministryId: string): Promise<MinistryImportBatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ministry_import_batches")
    .select("*")
    .eq("ministry_id", ministryId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`No se pudieron cargar las importaciones: ${error.message}`);
  return data ?? [];
}
