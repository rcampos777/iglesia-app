"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { classOfferingSchema, classSessionSchema, courseSchema } from "@/lib/validations/courses";
import type { AttendanceStatus } from "@/types/database";

const MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

function zodFieldErrors(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}) {
  const { fieldErrors } = error.flatten();
  const clean: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (value) clean[key] = value;
  }
  return clean;
}

export async function createCourseAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole([...MANAGE_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = courseSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description"),
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.from("courses").insert({
    category_id: parsed.data.categoryId,
    name: parsed.data.name,
    description: parsed.data.description || null,
  });

  if (error) return actionError(`No se pudo crear el curso: ${error.message}`);

  revalidatePath("/cursos");
  redirect("/cursos");
}

export async function createClassOfferingAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole([...MANAGE_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = classOfferingSchema.safeParse({
    courseId: formData.get("courseId"),
    label: formData.get("label"),
    teacherPersonId: formData.get("teacherPersonId"),
    location: formData.get("location"),
    scheduleText: formData.get("scheduleText"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    capacity: formData.get("capacity"),
    status: formData.get("status") || "planificada",
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_offerings")
    .insert({
      course_id: parsed.data.courseId,
      label: parsed.data.label,
      teacher_person_id: parsed.data.teacherPersonId || null,
      location: parsed.data.location || null,
      schedule_text: parsed.data.scheduleText || null,
      start_date: parsed.data.startDate || null,
      end_date: parsed.data.endDate || null,
      capacity: parsed.data.capacity ? Number(parsed.data.capacity) : null,
      status: parsed.data.status,
    })
    .select("id")
    .single();

  if (error || !data) return actionError(`No se pudo crear la clase: ${error?.message}`);

  revalidatePath("/cursos");
  redirect(`/cursos/clases/${data.id}`);
}

export async function addClassSessionAction(
  offeringId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireRole(["administrador", "pastor", "coordinador_ministerio", "maestro"]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = classSessionSchema.safeParse({
    sessionDate: formData.get("sessionDate"),
    topic: formData.get("topic"),
  });
  if (!parsed.success) return actionError("Revisa los datos.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { error } = await supabase.from("class_sessions").insert({
    class_offering_id: offeringId,
    session_date: parsed.data.sessionDate,
    topic: parsed.data.topic || null,
  });

  if (error) return actionError(`No se pudo agregar la sesión: ${error.message}`);

  revalidatePath(`/cursos/clases/${offeringId}`);
  return actionOk(undefined);
}

export async function enrollPersonAction(
  offeringId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireRole([
      "administrador",
      "pastor",
      "coordinador_ministerio",
      "maestro",
      "seguimiento",
    ]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const personId = formData.get("personId");
  if (typeof personId !== "string" || !personId) {
    return actionError("Selecciona una persona.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("enrollments").insert({
    class_offering_id: offeringId,
    person_id: personId,
    enrolled_by: user?.id ?? null,
  });

  if (error) {
    if (error.code === "23505") return actionError("Esta persona ya está matriculada en la clase.");
    return actionError(`No se pudo matricular: ${error.message}`);
  }

  revalidatePath(`/cursos/clases/${offeringId}`);
  return actionOk(undefined);
}

export async function recordAttendanceAction(
  offeringId: string,
  sessionId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireRole(["administrador", "pastor", "coordinador_ministerio", "maestro"]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const entries = Array.from(formData.entries()).filter(([key]) => key.startsWith("status:"));

  const rows = entries.map(([key, value]) => ({
    class_session_id: sessionId,
    person_id: key.replace("status:", ""),
    status: value as AttendanceStatus,
    recorded_by: user?.id ?? null,
  }));

  if (rows.length === 0) return actionOk(undefined);

  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "class_session_id,person_id" });

  if (error) return actionError(`No se pudo guardar la asistencia: ${error.message}`);

  revalidatePath(`/cursos/clases/${offeringId}`);
  return actionOk(undefined);
}
