import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FollowupStatus, MembershipStatus, PrayerStatus } from "@/types/database";
import { fetchAllPages } from "./paging";

export interface CountBucket {
  label: string;
  count: number;
}

// Cuenta en la base (head: true) en vez de traer filas: no depende del
// límite de 1000 filas de PostgREST y no transfiere datos.
async function countBuckets<T extends string>(
  labels: Record<T, string>,
  countFor: (key: T) => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<CountBucket[]> {
  const entries = Object.entries(labels) as [T, string][];
  return Promise.all(
    entries.map(async ([key, label]) => {
      const { count, error } = await countFor(key);
      if (error) throw new Error(error.message);
      return { label, count: count ?? 0 };
    }),
  );
}

export async function getPeopleByStatus(): Promise<CountBucket[]> {
  const supabase = await createClient();

  const labels: Record<MembershipStatus, string> = {
    visitante: "Visitantes",
    asistente_habitual: "Asistentes habituales",
    miembro: "Miembros",
    inactivo: "Inactivos",
  };

  return countBuckets(labels, (key) =>
    supabase
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("membership_status", key),
  );
}

export async function getFollowUpsByStatus(): Promise<CountBucket[]> {
  const supabase = await createClient();

  const labels: Record<FollowupStatus, string> = {
    pendiente: "Pendiente",
    en_progreso: "En progreso",
    completado: "Completado",
    no_contactable: "No contactable",
  };

  return countBuckets(labels, (key) =>
    supabase
      .from("visitor_follow_ups")
      .select("id", { count: "exact", head: true })
      .eq("status", key),
  );
}

export async function getPrayerRequestsByStatus(): Promise<CountBucket[]> {
  const supabase = await createClient();

  const labels: Record<PrayerStatus, string> = {
    nueva: "Nueva",
    en_oracion: "En oración",
    respondida: "Respondida",
    cerrada: "Cerrada",
  };

  return countBuckets(labels, (key) =>
    supabase.from("prayer_requests").select("id", { count: "exact", head: true }).eq("status", key),
  );
}

export interface ClassEnrollmentCount {
  label: string;
  count: number;
}

export async function getEnrollmentCountsByClass(): Promise<ClassEnrollmentCount[]> {
  const supabase = await createClient();

  const { data: offerings, error } = await supabase
    .from("class_offerings")
    .select("id, label")
    .eq("status", "activa");
  if (error) throw new Error(error.message);
  if (!offerings || offerings.length === 0) return [];

  const counts = new Map<string, number>();
  await Promise.all(
    offerings.map(async (o) => {
      const { count } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("class_offering_id", o.id);
      counts.set(o.id, count ?? 0);
    }),
  );

  return (offerings ?? [])
    .map((o) => ({ label: o.label, count: counts.get(o.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

export interface ServiceAttendanceCount {
  label: string;
  date: string;
  count: number;
}

export async function getRecentServiceAttendance(limit = 8): Promise<ServiceAttendanceCount[]> {
  const supabase = await createClient();

  const { data: services } = await supabase
    .from("services")
    .select("id, name, service_date")
    .order("service_date", { ascending: false })
    .limit(limit);

  if (!services || services.length === 0) return [];

  const counts = new Map<string, number>();
  await Promise.all(
    services.map(async (s) => {
      const { count } = await supabase
        .from("service_checkins")
        .select("id", { count: "exact", head: true })
        .eq("service_id", s.id);
      counts.set(s.id, count ?? 0);
    }),
  );

  return services
    .map((s) => ({
      label: s.name,
      date: s.service_date,
      count: counts.get(s.id) ?? 0,
    }))
    .reverse();
}

export interface MinistryServingCount {
  ministryId: string;
  ministryName: string;
  activeMembers: number;
}

/**
 * Cuántas personas sirven activamente en cada ministerio. Solo cuenta
 * las filas que RLS deja ver a quien consulta (staff ve todas).
 */
export async function getMinistryServingCounts(): Promise<MinistryServingCount[]> {
  const supabase = await createClient();

  const { data: ministries, error } = await supabase
    .from("ministries")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  if (!ministries || ministries.length === 0) return [];

  const memberships = await fetchAllPages((from, to) =>
    supabase
      .from("ministry_memberships")
      .select("id, ministry_id")
      .is("left_at", null)
      .order("id")
      .range(from, to),
  );

  const counts = new Map<string, number>();
  for (const m of memberships) {
    counts.set(m.ministry_id, (counts.get(m.ministry_id) ?? 0) + 1);
  }

  return ministries
    .map((m) => ({
      ministryId: m.id,
      ministryName: m.name,
      activeMembers: counts.get(m.id) ?? 0,
    }))
    .sort((a, b) => b.activeMembers - a.activeMembers);
}

export interface ActivityParticipationCount {
  activityName: string;
  registered: number;
  attended: number;
}

/** Participación en las actividades más recientes ya realizadas. */
export async function getRecentActivityParticipation(
  limit = 8,
): Promise<ActivityParticipationCount[]> {
  const supabase = await createClient();

  const { data: activities, error } = await supabase
    .from("activities")
    .select("id, name")
    .eq("status", "realizada")
    .order("activity_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!activities || activities.length === 0) return [];

  const registered = new Map<string, number>();
  const attended = new Map<string, number>();
  await Promise.all(
    activities.map(async (a) => {
      const [reg, att] = await Promise.all([
        supabase
          .from("activity_participants")
          .select("id", { count: "exact", head: true })
          .eq("activity_id", a.id),
        supabase
          .from("activity_participants")
          .select("id", { count: "exact", head: true })
          .eq("activity_id", a.id)
          .eq("attended", true),
      ]);
      registered.set(a.id, reg.count ?? 0);
      attended.set(a.id, att.count ?? 0);
    }),
  );

  return activities.map((a) => ({
    activityName: a.name,
    registered: registered.get(a.id) ?? 0,
    attended: attended.get(a.id) ?? 0,
  }));
}
