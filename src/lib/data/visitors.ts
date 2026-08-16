import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FollowUpNoteRow, FollowupStatus, VisitorFollowUpRow } from "@/types/database";

export interface FollowUpWithPerson extends VisitorFollowUpRow {
  personFirstName: string;
  personLastName: string;
  personPhone: string | null;
  personEmail: string | null;
}

export async function listFollowUps(
  filters: {
    status?: FollowupStatus | "todos";
  } = {},
): Promise<FollowUpWithPerson[]> {
  const supabase = await createClient();

  let query = supabase
    .from("visitor_follow_ups")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.status && filters.status !== "todos") {
    query = query.eq("status", filters.status);
  }

  const { data: followUps, error } = await query;
  if (error) throw new Error(`No se pudo cargar el seguimiento: ${error.message}`);
  if (!followUps || followUps.length === 0) return [];

  const { data: people } = await supabase
    .from("people")
    .select("id, first_name, last_name, phone, email")
    .in(
      "id",
      followUps.map((f) => f.person_id),
    );

  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  return followUps.map((f) => {
    const p = peopleById.get(f.person_id);
    return {
      ...f,
      personFirstName: p?.first_name ?? "?",
      personLastName: p?.last_name ?? "?",
      personPhone: p?.phone ?? null,
      personEmail: p?.email ?? null,
    };
  });
}

export interface FollowUpDetail {
  followUp: FollowUpWithPerson;
  notes: FollowUpNoteRow[];
}

export async function getFollowUp(id: string): Promise<FollowUpDetail | null> {
  const supabase = await createClient();

  const { data: followUp, error } = await supabase
    .from("visitor_follow_ups")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!followUp) return null;

  const [{ data: person }, { data: notes }] = await Promise.all([
    supabase
      .from("people")
      .select("id, first_name, last_name, phone, email")
      .eq("id", followUp.person_id)
      .maybeSingle(),
    supabase
      .from("follow_up_notes")
      .select("*")
      .eq("follow_up_id", id)
      .order("contacted_at", { ascending: false }),
  ]);

  return {
    followUp: {
      ...followUp,
      personFirstName: person?.first_name ?? "?",
      personLastName: person?.last_name ?? "?",
      personPhone: person?.phone ?? null,
      personEmail: person?.email ?? null,
    },
    notes: notes ?? [],
  };
}
