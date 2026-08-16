import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PrayerRequestRow, PrayerStatus } from "@/types/database";

export interface PrayerRequestListItem extends PrayerRequestRow {
  requesterName: string | null;
}

export async function listPrayerRequests(
  filters: {
    status?: PrayerStatus | "todas";
  } = {},
): Promise<PrayerRequestListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("prayer_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (filters.status && filters.status !== "todas") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron cargar las peticiones: ${error.message}`);
  if (!data || data.length === 0) return [];

  const personIds = data
    .filter((r) => !r.is_anonymous && r.requester_person_id)
    .map((r) => r.requester_person_id as string);

  const { data: people } = personIds.length
    ? await supabase.from("people").select("id, first_name, last_name").in("id", personIds)
    : { data: [] };

  const nameById = new Map((people ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

  return data.map((r) => ({
    ...r,
    requesterName: r.is_anonymous
      ? null
      : r.requester_person_id
        ? (nameById.get(r.requester_person_id) ?? null)
        : null,
  }));
}

/**
 * Lectura de DETALLE de una petición. Este es el único camino soportado
 * para leer el contenido completo — registra el acceso en
 * prayer_request_access_log (ver docs/security.md). No exponer una
 * consulta directa de detalle desde el cliente.
 */
export async function getPrayerRequestDetail(id: string): Promise<PrayerRequestListItem | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prayer_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  await supabase.rpc("log_prayer_request_access", { request_id: id, access_action: "view" });

  let requesterName: string | null = null;
  if (!data.is_anonymous && data.requester_person_id) {
    const { data: person } = await supabase
      .from("people")
      .select("first_name, last_name")
      .eq("id", data.requester_person_id)
      .maybeSingle();
    if (person) requesterName = `${person.first_name} ${person.last_name}`;
  }

  return { ...data, requesterName };
}
