import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type {
  ActivityRegistrationPaymentRow,
  ActivityRegistrationRow,
  Database,
} from "@/types/database";
import { fetchInChunks } from "./paging";

export type PublicRegistrationActivity =
  Database["public"]["Functions"]["public_registration_activity"]["Returns"][number];

/** Actividad con inscripción abierta, vista por el público. */
export async function publicRegistrationActivity(
  slug: string,
): Promise<PublicRegistrationActivity | null> {
  const db = createPublicClient();
  const { data, error } = await db.rpc("public_registration_activity", { p_slug: slug });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export interface CandidatePerson {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface RegistrationWithDetails extends ActivityRegistrationRow {
  payments: ActivityRegistrationPaymentRow[];
  candidates: CandidatePerson[];
}

/**
 * Inscripciones en línea de una actividad. La RLS solo las devuelve a
 * quien organiza la actividad; para el resto, lista vacía.
 */
export async function listActivityRegistrations(
  activityId: string,
): Promise<RegistrationWithDetails[]> {
  const supabase = await createClient();
  const { data: regs, error } = await supabase
    .from("activity_registrations")
    .select("*")
    .eq("activity_id", activityId)
    .order("created_at");
  if (error) throw new Error(`No se pudieron cargar las inscripciones: ${error.message}`);
  if (!regs?.length) return [];

  const candidateIds = [...new Set(regs.flatMap((r) => r.candidate_person_ids))];
  const [payments, people] = await Promise.all([
    fetchInChunks(
      regs.map((r) => r.id),
      (ids) =>
        supabase
          .from("activity_registration_payments")
          .select("*")
          .in("registration_id", ids)
          .order("paid_on"),
    ),
    candidateIds.length
      ? fetchInChunks(candidateIds, (ids) =>
          supabase.from("people").select("id, first_name, last_name, email, phone").in("id", ids),
        )
      : Promise.resolve([] as CandidatePerson[]),
  ]);

  const peopleById = new Map(people.map((p) => [p.id, p]));
  return regs.map((r) => ({
    ...r,
    payments: payments.filter((p) => p.registration_id === r.id),
    candidates: r.candidate_person_ids
      .map((id) => peopleById.get(id))
      .filter((p): p is CandidatePerson => Boolean(p)),
  }));
}

export interface MediaOption {
  id: string;
  storage_path: string;
  thumb_path: string;
  alt_text: string;
}

/** Fotos de la biblioteca del sitio, para elegir el flyer. */
export async function listSiteMediaOptions(): Promise<MediaOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("site_media")
    .select("id, storage_path, thumb_path, alt_text")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return data ?? [];
}
