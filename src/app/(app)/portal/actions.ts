"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { z } from "zod";

const contactSchema = z.object({
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido.").optional().or(z.literal("")),
  addressLine: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  preferredName: z.string().trim().max(100).optional().or(z.literal("")),
});

export async function updateOwnContactAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireAuth();
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsed = contactSchema.safeParse({
    phone: formData.get("phone"),
    email: formData.get("email"),
    addressLine: formData.get("addressLine"),
    city: formData.get("city"),
    preferredName: formData.get("preferredName"),
  });
  if (!parsed.success) return actionError("Revisa los datos ingresados.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_contact_info", {
    p_phone: parsed.data.phone || null,
    p_email: parsed.data.email || null,
    p_address_line: parsed.data.addressLine || null,
    p_city: parsed.data.city || null,
    p_preferred_name: parsed.data.preferredName || null,
  });

  if (error) return actionError(`No se pudo actualizar: ${error.message}`);

  revalidatePath("/portal");
  return actionOk(undefined);
}

const prayerRequestSchema = z.object({
  content: z.string().trim().min(5, "Escribe tu petición (mínimo 5 caracteres)."),
  category: z.string().trim().max(50).optional().or(z.literal("")),
  urgency: z.enum(["normal", "urgente"]).default("normal"),
  isAnonymous: z.literal("on").optional(),
});

export async function submitPrayerRequestAction(formData: FormData): Promise<ActionResult> {
  const user = await (async () => {
    try {
      return await requireAuth();
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!user) return actionError("Debes iniciar sesión.");

  const parsed = prayerRequestSchema.safeParse({
    content: formData.get("content"),
    category: formData.get("category"),
    urgency: formData.get("urgency") || "normal",
    isAnonymous: formData.get("isAnonymous"),
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  }

  const isAnonymous = parsed.data.isAnonymous === "on";
  const supabase = await createClient();

  const { error } = await supabase.from("prayer_requests").insert({
    requester_person_id: isAnonymous ? null : (user.personId ?? null),
    submitted_by_user_id: user.userId,
    is_anonymous: isAnonymous,
    content: parsed.data.content,
    category: parsed.data.category || null,
    urgency: parsed.data.urgency,
  });

  if (error) return actionError(`No se pudo enviar la petición: ${error.message}`);

  revalidatePath("/portal");
  return actionOk(undefined);
}
