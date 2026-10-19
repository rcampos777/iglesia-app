import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearchTerm } from "@/lib/supabase/filter-utils";
import type { MembershipStatus, PersonRow, PersonSource } from "@/types/database";

export interface PeopleListFilters {
  q?: string;
  status?: MembershipStatus | "todos";
  source?: PersonSource;
  sourceActivityId?: string;
  limit?: number;
  offset?: number;
}

export interface PeopleListResult {
  people: PersonRow[];
  total: number;
  /** Nombre de la actividad de origen, por id (para la etiqueta de origen). */
  activityNames: Record<string, string>;
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
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.sourceActivityId) query = query.eq("source_activity_id", filters.sourceActivityId);

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

  const people = data ?? [];
  const activityIds = [
    ...new Set(people.map((p) => p.source_activity_id).filter((id): id is string => !!id)),
  ];
  const activityNames: Record<string, string> = {};
  if (activityIds.length > 0) {
    const { data: acts } = await supabase
      .from("activities")
      .select("id, name")
      .in("id", activityIds);
    for (const a of acts ?? []) activityNames[a.id] = a.name;
  }

  return { people, total: count ?? 0, activityNames };
}

/** Actividades con inscripción en línea, para el filtro "Origen". */
export async function listRegistrationActivities(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select("id, name")
    .not("registration_slug", "is", null)
    .order("activity_date", { ascending: false })
    .limit(50);
  if (error) throw new Error(`No se pudieron cargar las actividades: ${error.message}`);
  return data ?? [];
}

export async function getActivityName(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("name").eq("id", id).maybeSingle();
  return data?.name ?? null;
}

export async function getPerson(id: string): Promise<PersonRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`No se pudo cargar la persona: ${error.message}`);
  }

  return data;
}

/**
 * Qué impide borrar a una persona (0046), por tipo y cantidad. Vacío =
 * se puede borrar. Solo SuperAdmin; para cualquier otro devuelve null.
 */
export async function getPersonDeleteBlockers(id: string): Promise<Record<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("person_delete_blockers", { p_person_id: id });
  if (error) return null;
  return (data ?? {}) as Record<string, number>;
}
