import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ActivityParticipantRow, ActivityRow, ActivityStatus } from "@/types/database";

export interface ActivityWithSummary extends ActivityRow {
  ministryName: string | null;
  responsibleName: string | null;
  registeredCount: number;
  attendedCount: number;
}

export async function listActivities(
  filters: { status?: ActivityStatus | "todas"; ministryIds?: string[] } = {},
): Promise<ActivityWithSummary[]> {
  const supabase = await createClient();

  let query = supabase.from("activities").select("*").order("activity_date", { ascending: false });

  if (filters.status && filters.status !== "todas") {
    query = query.eq("status", filters.status);
  }
  // Acotar a los ministerios indicados (el pastor solo ve los suyos).
  if (filters.ministryIds) {
    if (filters.ministryIds.length === 0) return [];
    query = query.in("ministry_id", filters.ministryIds);
  }

  const { data: activities, error } = await query;
  if (error) throw new Error(`No se pudieron cargar las actividades: ${error.message}`);
  if (!activities || activities.length === 0) return [];

  const ministryIds = activities
    .map((a) => a.ministry_id)
    .filter((id): id is string => Boolean(id));
  const personIds = activities
    .map((a) => a.responsible_person_id)
    .filter((id): id is string => Boolean(id));

  const [ministriesRes, peopleRes, participantsRes] = await Promise.all([
    ministryIds.length
      ? supabase.from("ministries").select("id, name").in("id", ministryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    personIds.length
      ? supabase.from("people").select("id, first_name, last_name").in("id", personIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    supabase
      .from("activity_participants")
      .select("activity_id, attended")
      .in(
        "activity_id",
        activities.map((a) => a.id),
      ),
  ]);

  const ministryById = new Map((ministriesRes.data ?? []).map((m) => [m.id, m.name]));
  const personById = new Map((peopleRes.data ?? []).map((p) => [p.id, p]));

  const registered = new Map<string, number>();
  const attended = new Map<string, number>();
  for (const p of participantsRes.data ?? []) {
    registered.set(p.activity_id, (registered.get(p.activity_id) ?? 0) + 1);
    if (p.attended) attended.set(p.activity_id, (attended.get(p.activity_id) ?? 0) + 1);
  }

  return activities.map((a) => {
    const person = a.responsible_person_id ? personById.get(a.responsible_person_id) : undefined;
    return {
      ...a,
      ministryName: a.ministry_id ? (ministryById.get(a.ministry_id) ?? null) : null,
      responsibleName: person ? `${person.first_name} ${person.last_name}` : null,
      registeredCount: registered.get(a.id) ?? 0,
      attendedCount: attended.get(a.id) ?? 0,
    };
  });
}

export interface ActivityParticipantWithPerson extends ActivityParticipantRow {
  personFirstName: string;
  personLastName: string;
  personPhone: string | null;
  personEmail: string | null;
}

export interface ActivityDetail {
  activity: ActivityWithSummary;
  participants: ActivityParticipantWithPerson[];
}

export async function getActivityDetail(id: string): Promise<ActivityDetail | null> {
  const supabase = await createClient();

  const { data: activity, error } = await supabase
    .from("activities")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la actividad: ${error.message}`);
  if (!activity) return null;

  const { data: participants, error: participantsError } = await supabase
    .from("activity_participants")
    .select("*")
    .eq("activity_id", id)
    .order("registered_at");
  if (participantsError) {
    throw new Error(`No se pudieron cargar los participantes: ${participantsError.message}`);
  }

  const rows = participants ?? [];
  const personIds = new Set(rows.map((p) => p.person_id));
  if (activity.responsible_person_id) personIds.add(activity.responsible_person_id);

  const [peopleRes, ministryRes] = await Promise.all([
    personIds.size
      ? supabase
          .from("people")
          .select("id, first_name, last_name, phone, email")
          .in("id", [...personIds])
      : Promise.resolve({ data: [] }),
    activity.ministry_id
      ? supabase.from("ministries").select("name").eq("id", activity.ministry_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const peopleById = new Map((peopleRes.data ?? []).map((p) => [p.id, p]));
  const responsible = activity.responsible_person_id
    ? peopleById.get(activity.responsible_person_id)
    : undefined;

  return {
    activity: {
      ...activity,
      ministryName: ministryRes.data?.name ?? null,
      responsibleName: responsible ? `${responsible.first_name} ${responsible.last_name}` : null,
      registeredCount: rows.length,
      attendedCount: rows.filter((p) => p.attended).length,
    },
    participants: rows.map((p) => {
      const person = peopleById.get(p.person_id);
      return {
        ...p,
        personFirstName: person?.first_name ?? "?",
        personLastName: person?.last_name ?? "?",
        personPhone: person?.phone ?? null,
        personEmail: person?.email ?? null,
      };
    }),
  };
}

export interface PersonActivity extends ActivityParticipantRow {
  activityName: string;
  activityDate: string;
  activityLocation: string | null;
  activityStatus: ActivityStatus;
}

/** Actividades en las que está inscrita una persona (para su portal). */
export async function listActivitiesForPerson(personId: string): Promise<PersonActivity[]> {
  const supabase = await createClient();

  const { data: participations, error } = await supabase
    .from("activity_participants")
    .select("*")
    .eq("person_id", personId);
  if (error) throw new Error(`No se pudieron cargar tus actividades: ${error.message}`);
  if (!participations || participations.length === 0) return [];

  const { data: activities } = await supabase
    .from("activities")
    .select("id, name, activity_date, location, status")
    .in(
      "id",
      participations.map((p) => p.activity_id),
    )
    .order("activity_date", { ascending: false });

  const byId = new Map((activities ?? []).map((a) => [a.id, a]));

  return participations
    .map((p) => {
      const a = byId.get(p.activity_id);
      return a
        ? {
            ...p,
            activityName: a.name,
            activityDate: a.activity_date,
            activityLocation: a.location,
            activityStatus: a.status,
          }
        : null;
    })
    .filter((a): a is PersonActivity => a !== null)
    .sort((a, b) => b.activityDate.localeCompare(a.activityDate));
}
