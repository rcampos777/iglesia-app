import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EnrollmentStatus, FollowupStatus, MembershipStatus } from "@/types/database";

/**
 * Trayectoria de una persona: por dónde ha pasado desde que llegó y
 * dónde está hoy. No hay tabla nueva — se arma juntando lo que ya
 * registran los demás módulos (seguimiento, matrículas, ministerios,
 * actividades, check-ins), que es justo el valor: los datos ya estaban,
 * pero dispersos en cinco pantallas distintas.
 */

export type JourneyEventKind =
  "registro" | "primera_visita" | "seguimiento" | "curso" | "ministerio" | "actividad";

export interface JourneyEvent {
  /** YYYY-MM-DD. Se usa para ordenar la línea de tiempo. */
  date: string;
  kind: JourneyEventKind;
  title: string;
  detail: string | null;
}

export interface FormationStep {
  courseName: string;
  categoryName: string;
  classLabel: string;
  status: EnrollmentStatus;
  attendancePercent: number;
  startDate: string | null;
}

export interface PersonJourney {
  events: JourneyEvent[];
  formation: FormationStep[];
  current: {
    membershipStatus: MembershipStatus;
    joinedAt: string | null;
    registeredAt: string;
    followUpStatus: FollowupStatus | null;
    ministries: { name: string; role: string; since: string }[];
    coursesCompleted: number;
    coursesInProgress: number;
    activitiesAttended: number;
    checkinCount: number;
    lastCheckin: string | null;
  };
}

export async function getPersonJourney(personId: string): Promise<PersonJourney | null> {
  const supabase = await createClient();

  const { data: person, error } = await supabase
    .from("people")
    .select("id, created_at, joined_at, membership_status")
    .eq("id", personId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo cargar la trayectoria: ${error.message}`);
  if (!person) return null;

  const [followUpsRes, enrollmentsRes, progressRes, ministriesRes, activitiesRes, checkinsRes] =
    await Promise.all([
      supabase
        .from("visitor_follow_ups")
        .select("id, status, first_visit_date, created_at")
        .eq("person_id", personId),
      supabase.from("enrollments").select("*").eq("person_id", personId),
      supabase.from("enrollment_progress").select("*").eq("person_id", personId),
      supabase.from("ministry_memberships").select("*").eq("person_id", personId),
      supabase.from("activity_participants").select("*").eq("person_id", personId),
      supabase
        .from("service_checkins")
        .select("id, checked_in_at")
        .eq("person_id", personId)
        .order("checked_in_at", { ascending: false }),
    ]);

  const enrollments = enrollmentsRes.data ?? [];
  const ministryRows = ministriesRes.data ?? [];
  const activityRows = activitiesRes.data ?? [];
  const checkins = checkinsRes.data ?? [];

  // Nombres de las entidades referenciadas, en lotes.
  const offeringIds = enrollments.map((e) => e.class_offering_id);
  const { data: offerings } = offeringIds.length
    ? await supabase
        .from("class_offerings")
        .select("id, label, course_id, start_date")
        .in("id", offeringIds)
    : { data: [] };

  const courseIds = (offerings ?? []).map((o) => o.course_id);
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id, name, category_id").in("id", courseIds)
    : { data: [] };

  const categoryIds = (courses ?? []).map((c) => c.category_id);
  const { data: categories } = categoryIds.length
    ? await supabase.from("course_categories").select("id, name").in("id", categoryIds)
    : { data: [] };

  const { data: ministries } = ministryRows.length
    ? await supabase
        .from("ministries")
        .select("id, name")
        .in(
          "id",
          ministryRows.map((m) => m.ministry_id),
        )
    : { data: [] };

  const { data: activities } = activityRows.length
    ? await supabase
        .from("activities")
        .select("id, name, activity_date")
        .in(
          "id",
          activityRows.map((a) => a.activity_id),
        )
    : { data: [] };

  const offeringById = new Map((offerings ?? []).map((o) => [o.id, o]));
  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const ministryNameById = new Map((ministries ?? []).map((m) => [m.id, m.name]));
  const activityById = new Map((activities ?? []).map((a) => [a.id, a]));
  const progressByEnrollment = new Map(
    (progressRes.data ?? []).map((p) => [p.enrollment_id, p.attendance_percent]),
  );

  const events: JourneyEvent[] = [];
  const day = (value: string) => value.slice(0, 10);

  events.push({
    date: day(person.created_at),
    kind: "registro",
    title: "Entró al directorio de la iglesia",
    detail: null,
  });

  for (const f of followUpsRes.data ?? []) {
    if (f.first_visit_date) {
      events.push({
        date: f.first_visit_date,
        kind: "primera_visita",
        title: "Primera visita registrada",
        detail: null,
      });
    }
    events.push({
      date: day(f.created_at),
      kind: "seguimiento",
      title: "Entró en seguimiento de visitantes",
      detail: `Estado: ${f.status}`,
    });
  }

  const formation: FormationStep[] = [];

  for (const e of enrollments) {
    const offering = offeringById.get(e.class_offering_id);
    const course = offering ? courseById.get(offering.course_id) : undefined;
    const categoryName = course ? (categoryById.get(course.category_id) ?? "—") : "—";
    const attendancePercent = Number(progressByEnrollment.get(e.id) ?? 0);

    formation.push({
      courseName: course?.name ?? "—",
      categoryName,
      classLabel: offering?.label ?? "—",
      status: e.status,
      attendancePercent,
      startDate: offering?.start_date ?? null,
    });

    events.push({
      date: day(e.enrolled_at),
      kind: "curso",
      title: `Se matriculó en ${course?.name ?? "un curso"}`,
      detail: `${categoryName} · ${attendancePercent}% de asistencia`,
    });

    // Completar el curso es el hito que de verdad marca la ruta
    // (terminó nuevos convertidos, terminó liderazgo...).
    if (e.completed_at) {
      events.push({
        date: day(e.completed_at),
        kind: "curso",
        title: `Completó ${course?.name ?? "un curso"}`,
        detail: categoryName,
      });
    }
  }

  for (const m of ministryRows) {
    const name = ministryNameById.get(m.ministry_id) ?? "un ministerio";
    events.push({
      date: m.joined_at,
      kind: "ministerio",
      title: `Empezó a servir en ${name}`,
      detail: `Como ${m.role_in_ministry}`,
    });
    if (m.left_at) {
      events.push({
        date: m.left_at,
        kind: "ministerio",
        title: `Dejó de servir en ${name}`,
        detail: null,
      });
    }
  }

  for (const a of activityRows) {
    const activity = activityById.get(a.activity_id);
    if (!activity) continue;
    events.push({
      date: activity.activity_date,
      kind: "actividad",
      title: a.attended ? `Asistió a ${activity.name}` : `Se inscribió en ${activity.name}`,
      detail: a.attended ? null : "No se registró su asistencia",
    });
  }

  events.sort((a, b) => b.date.localeCompare(a.date));

  // La ruta de formación se lee en el orden en que la persona la recorrió
  // (nuevos convertidos primero, liderazgo después).
  formation.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  return {
    events,
    formation,
    current: {
      membershipStatus: person.membership_status,
      joinedAt: person.joined_at,
      registeredAt: day(person.created_at),
      followUpStatus: (followUpsRes.data ?? [])[0]?.status ?? null,
      ministries: ministryRows
        .filter((m) => m.left_at === null)
        .map((m) => ({
          name: ministryNameById.get(m.ministry_id) ?? "—",
          role: m.role_in_ministry,
          since: m.joined_at,
        })),
      coursesCompleted: enrollments.filter((e) => e.status === "completado").length,
      coursesInProgress: enrollments.filter((e) => ["inscrito", "en_progreso"].includes(e.status))
        .length,
      activitiesAttended: activityRows.filter((a) => a.attended).length,
      checkinCount: checkins.length,
      lastCheckin: checkins[0] ? day(checkins[0].checked_in_at) : null,
    },
  };
}
