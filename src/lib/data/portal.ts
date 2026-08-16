import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PersonRow, PrayerRequestRow } from "@/types/database";

export async function getMyPerson(personId: string): Promise<PersonRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("id", personId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export interface MyEnrollment {
  enrollmentId: string;
  classOfferingId: string;
  classLabel: string;
  courseName: string;
  status: string;
  attendancePercent: number;
}

export async function getMyEnrollments(personId: string): Promise<MyEnrollment[]> {
  const supabase = await createClient();

  const { data: enrollments, error } = await supabase
    .from("enrollments")
    .select("*")
    .eq("person_id", personId);
  if (error) throw new Error(error.message);
  if (!enrollments || enrollments.length === 0) return [];

  const offeringIds = enrollments.map((e) => e.class_offering_id);

  const [{ data: offerings }, { data: sessions }, { data: attendance }] = await Promise.all([
    supabase.from("class_offerings").select("id, label, course_id").in("id", offeringIds),
    supabase
      .from("class_sessions")
      .select("id, class_offering_id")
      .in("class_offering_id", offeringIds),
    supabase
      .from("attendance_records")
      .select("class_session_id, status")
      .eq("person_id", personId),
  ]);

  const courseIds = Array.from(new Set((offerings ?? []).map((o) => o.course_id)));
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id, name").in("id", courseIds)
    : { data: [] };

  const courseNameById = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const offeringById = new Map((offerings ?? []).map((o) => [o.id, o]));
  const sessionsByOffering = new Map<string, string[]>();
  for (const s of sessions ?? []) {
    const list = sessionsByOffering.get(s.class_offering_id) ?? [];
    list.push(s.id);
    sessionsByOffering.set(s.class_offering_id, list);
  }
  const attendanceBySession = new Map(
    (attendance ?? []).map((a) => [a.class_session_id, a.status]),
  );

  return enrollments.map((e) => {
    const offering = offeringById.get(e.class_offering_id);
    const sessionIds = sessionsByOffering.get(e.class_offering_id) ?? [];
    const attended = sessionIds.filter((id) => {
      const status = attendanceBySession.get(id);
      return status === "presente" || status === "tarde";
    }).length;
    const pct = sessionIds.length > 0 ? Math.round((attended / sessionIds.length) * 100) : 0;

    return {
      enrollmentId: e.id,
      classOfferingId: e.class_offering_id,
      classLabel: offering?.label ?? "—",
      courseName: offering ? (courseNameById.get(offering.course_id) ?? "—") : "—",
      status: e.status,
      attendancePercent: pct,
    };
  });
}

export async function getMyPrayerRequests(userId: string): Promise<PrayerRequestRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prayer_requests")
    .select("*")
    .eq("submitted_by_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
