import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  AttendanceRecordRow,
  AttendanceStatus,
  ClassOfferingRow,
  ClassSessionRow,
  ClassStatus,
  CourseCategoryRow,
  CourseRow,
  EnrollmentRow,
} from "@/types/database";

export async function listCourseCategories(): Promise<CourseCategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("course_categories")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`);
  return data ?? [];
}

export async function listCourses(): Promise<CourseRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(`No se pudieron cargar los cursos: ${error.message}`);
  return data ?? [];
}

export interface ClassOfferingWithNames extends ClassOfferingRow {
  courseName: string;
  categoryName: string;
  teacherName: string | null;
}

export async function listClassOfferings(
  filters: {
    status?: ClassStatus | "todas";
  } = {},
): Promise<ClassOfferingWithNames[]> {
  const supabase = await createClient();

  let query = supabase
    .from("class_offerings")
    .select("*")
    .order("start_date", { ascending: false });
  if (filters.status && filters.status !== "todas") {
    query = query.eq("status", filters.status);
  }

  const { data: offerings, error } = await query;
  if (error) throw new Error(`No se pudieron cargar las clases: ${error.message}`);
  if (!offerings || offerings.length === 0) return [];

  const [courses, categories, people] = await Promise.all([
    listCourses(),
    listCourseCategories(),
    supabase
      .from("people")
      .select("id, first_name, last_name")
      .in(
        "id",
        offerings.map((o) => o.teacher_person_id).filter((id): id is string => Boolean(id)),
      ),
  ]);

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const peopleById = new Map((people.data ?? []).map((p) => [p.id, p]));

  return offerings.map((o) => {
    const course = courseById.get(o.course_id);
    const category = course ? categoryById.get(course.category_id) : undefined;
    const teacher = o.teacher_person_id ? peopleById.get(o.teacher_person_id) : undefined;
    return {
      ...o,
      courseName: course?.name ?? "—",
      categoryName: category?.name ?? "—",
      teacherName: teacher ? `${teacher.first_name} ${teacher.last_name}` : null,
    };
  });
}

export interface EnrollmentWithPerson extends EnrollmentRow {
  personFirstName: string;
  personLastName: string;
}

export interface ClassOfferingDetail {
  offering: ClassOfferingWithNames;
  sessions: ClassSessionRow[];
  enrollments: EnrollmentWithPerson[];
  attendance: AttendanceRecordRow[];
}

export async function getClassOfferingDetail(id: string): Promise<ClassOfferingDetail | null> {
  const supabase = await createClient();

  const { data: offering, error: offeringError } = await supabase
    .from("class_offerings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (offeringError) throw new Error(offeringError.message);
  if (!offering) return null;

  const [course, sessionsRes, enrollmentsRes] = await Promise.all([
    supabase.from("courses").select("*").eq("id", offering.course_id).maybeSingle(),
    supabase.from("class_sessions").select("*").eq("class_offering_id", id).order("session_date"),
    supabase.from("enrollments").select("*").eq("class_offering_id", id),
  ]);

  const category = course.data
    ? await supabase
        .from("course_categories")
        .select("*")
        .eq("id", course.data.category_id)
        .maybeSingle()
    : { data: null };

  const teacher = offering.teacher_person_id
    ? await supabase
        .from("people")
        .select("id, first_name, last_name")
        .eq("id", offering.teacher_person_id)
        .maybeSingle()
    : { data: null };

  const enrollments = enrollmentsRes.data ?? [];
  const personIds = enrollments.map((e) => e.person_id);

  const { data: enrolledPeople } = personIds.length
    ? await supabase.from("people").select("id, first_name, last_name").in("id", personIds)
    : { data: [] };

  const peopleById = new Map((enrolledPeople ?? []).map((p) => [p.id, p]));

  const sessionIds = (sessionsRes.data ?? []).map((s) => s.id);
  const { data: attendance } = sessionIds.length
    ? await supabase.from("attendance_records").select("*").in("class_session_id", sessionIds)
    : { data: [] };

  return {
    offering: {
      ...offering,
      courseName: course.data?.name ?? "—",
      categoryName: category.data?.name ?? "—",
      teacherName: teacher.data ? `${teacher.data.first_name} ${teacher.data.last_name}` : null,
    },
    sessions: sessionsRes.data ?? [],
    enrollments: enrollments.map((e) => {
      const p = peopleById.get(e.person_id);
      return {
        ...e,
        personFirstName: p?.first_name ?? "?",
        personLastName: p?.last_name ?? "?",
      };
    }),
    attendance: attendance ?? [],
  };
}

export interface AttendanceUpsert {
  classSessionId: string;
  personId: string;
  status: AttendanceStatus;
}
