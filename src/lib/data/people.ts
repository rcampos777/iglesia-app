import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearchTerm } from "@/lib/supabase/filter-utils";
import type { MembershipStatus, PersonRow } from "@/types/database";

export interface PeopleListFilters {
  q?: string;
  status?: MembershipStatus | "todos";
  limit?: number;
  offset?: number;
}

export interface PeopleListResult {
  people: PersonRow[];
  total: number;
}

export async function listPeople(filters: PeopleListFilters = {}): Promise<PeopleListResult> {
  const supabase = await createClient();
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;

  let query = supabase
    .from("people")
    .select("*", { count: "exact" })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (filters.status && filters.status !== "todos") {
    query = query.eq("membership_status", filters.status);
  }

  if (filters.q) {
    const term = sanitizeSearchTerm(filters.q);
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`No se pudo cargar el directorio: ${error.message}`);
  }

  return { people: data ?? [], total: count ?? 0 };
}

export async function getPerson(id: string): Promise<PersonRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la persona: ${error.message}`);
  }

  return data;
}

export interface DuplicateCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

/**
 * Búsqueda de posibles duplicados por señales exactas (nunca por nombre
 * solo). Se usa antes de crear una persona desde la UI normal, para
 * evitar duplicados por accidente sin bloquear casos legítimos
 * (ej. dos personas distintas pueden compartir teléfono de casa).
 */
export async function findDuplicateCandidates(input: {
  email?: string;
  phone?: string;
}): Promise<DuplicateCandidate[]> {
  const supabase = await createClient();
  const conditions: string[] = [];

  if (input.email) conditions.push(`email.eq.${sanitizeSearchTerm(input.email)}`);
  if (input.phone) conditions.push(`phone.eq.${sanitizeSearchTerm(input.phone)}`);

  if (conditions.length === 0) return [];

  const { data, error } = await supabase
    .from("people")
    .select("id, first_name, last_name, email, phone")
    .or(conditions.join(","))
    .limit(5);

  if (error) {
    throw new Error(`No se pudo verificar duplicados: ${error.message}`);
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    email: p.email,
    phone: p.phone,
  }));
}
