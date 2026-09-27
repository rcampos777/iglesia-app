import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FollowUpNoteRow, FollowupStatus, VisitorFollowUpRow } from "@/types/database";
import { fetchAllPages, fetchInChunks } from "./paging";

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

  const status = filters.status && filters.status !== "todos" ? filters.status : null;

  let followUps: VisitorFollowUpRow[];
  try {
    followUps = await fetchAllPages((from, to) => {
      let query = supabase
        .from("visitor_follow_ups")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to);
      if (status) query = query.eq("status", status);
      return query;
    });
  } catch (e) {
    throw new Error(`No se pudo cargar el seguimiento: ${(e as Error).message}`);
  }
  if (followUps.length === 0) return [];

  const people = await fetchInChunks(
    followUps.map((f) => f.person_id),
    (ids) =>
      supabase.from("people").select("id, first_name, last_name, phone, email").in("id", ids),
  );

  const peopleById = new Map(people.map((p) => [p.id, p]));

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
