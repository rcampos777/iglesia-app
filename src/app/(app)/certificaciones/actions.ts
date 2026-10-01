"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AuthError, requireRole } from "@/lib/auth/require-role";
import { FINANCE_ROLES } from "@/lib/auth/finance";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { CERTIFICATION_BUCKET, CERTIFICATION_PATH_RE } from "@/lib/certifications";
import type { AppRole } from "@/types/database";

// Mismo acceso que Finanzas (apostol, finanzas). La base vuelve a validar
// en cada llamada (RLS + funciones de 0042).

async function guard(roles: AppRole[] = FINANCE_ROLES): Promise<ActionResult<never> | null> {
  try {
    await requireRole(roles);
    return null;
  } catch (err) {
    if (err instanceof AuthError) return actionError("No tienes permiso para esta acción.");
    throw err;
  }
}

function dbError(message: string): string {
  if (/dates_check/.test(message))
    return "La fecha de vencimiento no puede ser antes de la emisión.";
  if (/row-level security|No autorizado|42501/.test(message)) {
    return "No tienes permiso para esta acción.";
  }
  if (/certification_types_name_key|duplicate key/.test(message)) {
    return "Ya existe un tipo con ese nombre.";
  }
  return "No se pudo guardar. Intenta de nuevo.";
}

function refresh(id?: string) {
  revalidatePath("/certificaciones");
  if (id) revalidatePath(`/certificaciones/${id}`);
}

const optDate = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Fecha inválida.")
  .transform((v) => v || null);

const certificationSchema = z
  .object({
    id: z.string().uuid().optional(),
    personId: z.string().uuid({ message: "Elige la persona." }),
    typeId: z.string().uuid({ message: "Elige el tipo de certificación." }),
    issuedOn: optDate,
    expiresOn: optDate,
    notes: z.string().trim().max(1000, "Máximo 1000 caracteres."),
    file: z
      .object({
        path: z.string().regex(CERTIFICATION_PATH_RE, "Archivo inválido."),
        name: z.string().trim().min(1).max(200),
      })
      .nullable(),
    removeFile: z.boolean(),
  })
  .refine((v) => !v.issuedOn || !v.expiresOn || v.expiresOn >= v.issuedOn, {
    message: "La fecha de vencimiento no puede ser antes de la emisión.",
  })
  .refine((v) => !v.file || v.file.path.startsWith(`${v.personId}/`), {
    message: "Archivo inválido.",
  });

export type CertificationInput = z.input<typeof certificationSchema>;

export async function saveCertificationAction(
  input: CertificationInput,
): Promise<ActionResult<{ id: string }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = certificationSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const v = parsed.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  const fields = {
    person_id: v.personId,
    type_id: v.typeId,
    issued_on: v.issuedOn,
    expires_on: v.expiresOn,
    notes: v.notes || null,
  };

  if (!v.id) {
    const { data, error } = await supabase
      .from("person_certifications")
      .insert({
        ...fields,
        file_path: v.file?.path ?? null,
        file_name: v.file?.name ?? null,
        created_by: auth.user?.id ?? null,
        updated_by: auth.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      if (v.file) await supabase.storage.from(CERTIFICATION_BUCKET).remove([v.file.path]);
      return actionError(dbError(error?.message ?? ""));
    }
    refresh();
    return actionOk({ id: data.id });
  }

  const { data: current } = await supabase
    .from("person_certifications")
    .select("file_path, person_id")
    .eq("id", v.id)
    .maybeSingle();
  if (!current) return actionError("No se encontró la certificación.");
  if (current.person_id !== v.personId) return actionError("No se puede cambiar la persona.");

  const replacing = Boolean(v.file) || v.removeFile;
  const { error } = await supabase
    .from("person_certifications")
    .update({
      ...fields,
      ...(replacing ? { file_path: v.file?.path ?? null, file_name: v.file?.name ?? null } : {}),
      updated_by: auth.user?.id ?? null,
    })
    .eq("id", v.id);
  if (error) {
    if (v.file) await supabase.storage.from(CERTIFICATION_BUCKET).remove([v.file.path]);
    return actionError(dbError(error.message));
  }
  // El archivo anterior se borra después de guardar; si fallara queda
  // huérfano en el bucket privado, pero ya no está enlazado.
  if (replacing && current.file_path && current.file_path !== v.file?.path) {
    await supabase.storage.from(CERTIFICATION_BUCKET).remove([current.file_path]);
  }
  refresh(v.id);
  return actionOk({ id: v.id });
}

export async function deleteCertificationAction(id: string): Promise<ActionResult> {
  const denied = await guard(["apostol"]);
  if (denied) return denied;
  if (!z.string().uuid().safeParse(id).success) return actionError("Certificación inválida.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_certifications")
    .delete()
    .eq("id", id)
    .select("file_path");
  if (error) return actionError(dbError(error.message));
  if (!data?.length) return actionError("No se encontró la certificación o no puedes borrarla.");
  const path = data[0]?.file_path;
  if (path) await supabase.storage.from(CERTIFICATION_BUCKET).remove([path]);
  refresh();
  return actionOk(undefined);
}

const typeSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre.").max(120),
  description: z.string().trim().max(500),
});

export async function createCertificationTypeAction(
  input: z.input<typeof typeSchema>,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = typeSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("certification_types").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
    created_by: auth.user?.id ?? null,
  });
  if (error) return actionError(dbError(error.message));
  revalidatePath("/certificaciones/tipos");
  return actionOk(undefined);
}

export async function setCertificationTypeActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!z.string().uuid().safeParse(id).success) return actionError("Tipo inválido.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("certification_types")
    .update({ active: Boolean(active) })
    .eq("id", id);
  if (error) return actionError(dbError(error.message));
  revalidatePath("/certificaciones/tipos");
  return actionOk(undefined);
}
