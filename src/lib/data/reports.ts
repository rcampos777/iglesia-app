import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FollowupStatus, MembershipStatus, PrayerStatus } from "@/types/database";

export interface CountBucket {
  label: string;
  count: number;
}

function countBy<T extends string>(rows: { key: T }[], labels: Record<T, string>): CountBucket[] {
  const counts = new Map<T, number>();
  for (const r of rows) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
  return Object.entries(labels).map(([key, label]) => ({
    label: label as string,
    count: counts.get(key as T) ?? 0,
  }));
}

export async function getPeopleByStatus(): Promise<CountBucket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("people").select("membership_status");
  if (error) throw new Error(error.message);

  const labels: Record<MembershipStatus, string> = {
    visitante: "Visitantes",
    asistente_habitual: "Asistentes habituales",
    miembro: "Miembros",
    inactivo: "Inactivos",
  };

  return countBy(
    (data ?? []).map((d) => ({ key: d.membership_status })),
    labels,
  );
}

export async function getFollowUpsByStatus(): Promise<CountBucket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("visitor_follow_ups").select("status");
  if (error) throw new Error(error.message);

  const labels: Record<FollowupStatus, string> = {
    pendiente: "Pendiente",
    en_progreso: "En progreso",
    completado: "Completado",
    no_contactable: "No contactable",
  };

  return countBy(
    (data ?? []).map((d) => ({ key: d.status })),
    labels,
  );
}

export async function getPrayerRequestsByStatus(): Promise<CountBucket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("prayer_requests").select("status");
  if (error) throw new Error(error.message);

  const labels: Record<PrayerStatus, string> = {
    nueva: "Nueva",
    en_oracion: "En oración",
    respondida: "Respondida",
    cerrada: "Cerrada",
  };

  return countBy(
    (data ?? []).map((d) => ({ key: d.status })),
    labels,
  );
}

export interface ClassEnrollmentCount {
  label: string;
  count: number;
}

export async function getEnrollmentCountsByClass(): Promise<ClassEnrollmentCount[]> {
  const supabase = await createClient();

  const [{ data: offerings }, { data: enrollments }] = await Promise.all([
    supabase.from("class_offerings").select("id, label").eq("status", "activa"),
    supabase.from("enrollments").select("class_offering_id"),
  ]);

  const counts = new Map<string, number>();
  for (const e of enrollments ?? []) {
    counts.set(e.class_offering_id, (counts.get(e.class_offering_id) ?? 0) + 1);
  }

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

  const { data: checkins } = await supabase
    .from("service_checkins")
    .select("service_id")
    .in(
      "service_id",
      services.map((s) => s.id),
    );

  const counts = new Map<string, number>();
  for (const c of checkins ?? []) {
    counts.set(c.service_id, (counts.get(c.service_id) ?? 0) + 1);
  }

  return services
    .map((s) => ({
      label: s.name,
      date: s.service_date,
      count: counts.get(s.id) ?? 0,
    }))
    .reverse();
}
