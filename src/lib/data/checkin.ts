import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ServiceRow } from "@/types/database";

export async function listServices(): Promise<ServiceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .order("service_date", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getService(id: string): Promise<ServiceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export interface CheckinWithPerson {
  id: string;
  checkedInAt: string;
  method: string;
  personFirstName: string;
  personLastName: string;
}

export async function listServiceCheckins(serviceId: string): Promise<CheckinWithPerson[]> {
  const supabase = await createClient();
  const { data: checkins, error } = await supabase
    .from("service_checkins")
    .select("*")
    .eq("service_id", serviceId)
    .order("checked_in_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!checkins || checkins.length === 0) return [];

  const { data: people } = await supabase
    .from("people")
    .select("id, first_name, last_name")
    .in(
      "id",
      checkins.map((c) => c.person_id),
    );
  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  return checkins.map((c) => {
    const p = peopleById.get(c.person_id);
    return {
      id: c.id,
      checkedInAt: c.checked_in_at,
      method: c.method,
      personFirstName: p?.first_name ?? "?",
      personLastName: p?.last_name ?? "?",
    };
  });
}
