"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireAuth, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { verifyCheckinToken, createCheckinToken } from "@/lib/checkin/token";
import { z } from "zod";

const CHECKIN_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

const serviceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido."),
  serviceType: z.enum(["culto_general", "oracion", "jovenes", "ninos", "otro"]),
  serviceDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  startTime: z.string().optional().or(z.literal("")),
  location: z.string().trim().max(150).optional().or(z.literal("")),
});

export async function createServiceAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireRole([...CHECKIN_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = serviceSchema.safeParse({
    name: formData.get("name"),
    serviceType: formData.get("serviceType") || "culto_general",
    serviceDate: formData.get("serviceDate"),
    startTime: formData.get("startTime"),
    location: formData.get("location"),
  });
  if (!parsed.success) return actionError("Revisa los datos.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      name: parsed.data.name,
      service_type: parsed.data.serviceType,
      service_date: parsed.data.serviceDate,
      start_time: parsed.data.startTime || null,
      location: parsed.data.location || null,
      is_checkin_open: true,
    })
    .select("id")
    .single();

  if (error || !data) return actionError(`No se pudo crear el servicio: ${error?.message}`);

  revalidatePath("/check-in");
  redirect(`/check-in/${data.id}`);
}

async function insertCheckin(serviceId: string, personId: string, method: "qr" | "manual") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("service_checkins").insert({
    service_id: serviceId,
    person_id: personId,
    method,
    checked_in_by: user?.id ?? null,
  });

  if (error) {
    if (error.code === "23505")
      return actionError("Esta persona ya hizo check-in en este servicio.");
    return actionError(`No se pudo registrar el check-in: ${error.message}`);
  }

  revalidatePath(`/check-in/${serviceId}`);
  return actionOk(undefined);
}

export async function scanCheckinAction(serviceId: string, token: string): Promise<ActionResult> {
  try {
    await requireRole([...CHECKIN_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const result = verifyCheckinToken(token.trim());
  if (!result.valid || !result.personId) {
    const messages: Record<string, string> = {
      formato_invalido: "Código no reconocido.",
      firma_invalida: "Código inválido.",
      expirado: "El código QR expiró. Pide a la persona que lo regenere.",
    };
    return actionError(messages[result.reason ?? ""] ?? "Código inválido.");
  }

  return insertCheckin(serviceId, result.personId, "qr");
}

export async function manualCheckinAction(
  serviceId: string,
  personId: string,
): Promise<ActionResult> {
  try {
    await requireRole([...CHECKIN_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  return insertCheckin(serviceId, personId, "manual");
}

export async function getMyCheckinTokenAction(): Promise<ActionResult<{ token: string }>> {
  const user = await (async () => {
    try {
      return await requireAuth();
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();

  if (!user?.personId) return actionError("No tienes un perfil de persona asociado.");

  return actionOk({ token: createCheckinToken(user.personId) });
}
