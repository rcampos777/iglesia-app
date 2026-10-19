"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
  claimCodeSchema,
  claimStartSchema,
  identityReviewSchema,
} from "@/lib/validations/person-registry";
import { emailConfigured, sendIdentityCodeEmail } from "@/lib/email/identity-emails";

/**
 * Busca (en el servidor) un registro anterior de esta cuenta y, si hay
 * uno que concuerda con seguridad, manda un código al correo que ese
 * registro ya tenía. La respuesta es la misma haya o no coincidencia:
 * nadie puede averiguar así quién está registrado.
 *
 * service_role: identity_claim_start devuelve el código para enviarlo, así
 * que solo el servidor puede llamarla (si la llamara el usuario, se
 * saltaría la verificación). El usuario se toma de la sesión, nunca del
 * formulario.
 */
export async function startIdentityClaimAction(input: {
  phone: string;
  birthDate: string;
}): Promise<ActionResult> {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const parsed = claimStartSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  // Sin proveedor de correo no hay verificación: no se simula.
  if (!emailConfigured()) {
    return actionError(
      "La verificación por correo no está disponible en este momento. Puedes pedir que la iglesia revise tu caso.",
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("identity_claim_start", {
    p_user_id: user.userId,
    p_phone: parsed.data.phone || null,
    p_birth: parsed.data.birthDate || null,
  });
  if (error || !data) {
    console.error("identity_claim_start failed", { message: error?.message });
    return actionError("No se pudo iniciar la verificación. Intenta más tarde.");
  }
  if (data.status === "limite") {
    return actionError(
      "Hiciste muchos intentos hoy. Intenta mañana o pide que la iglesia revise tu caso.",
    );
  }
  if (data.send_to && data.code && data.claim_id) {
    const sent = await sendIdentityCodeEmail({
      to: data.send_to,
      code: data.code,
      claimId: data.claim_id,
    });
    if (!sent.ok) console.error("identity code email failed", { error: sent.error });
  }
  return actionOk(undefined);
}

export async function verifyIdentityClaimAction(code: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireAuth();
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const parsed = claimCodeSchema.safeParse(code);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Código inválido.");

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("identity_claim_verify", {
    p_user_id: user.userId,
    p_code: parsed.data,
  });
  if (error || !data) {
    console.error("identity_claim_verify failed", { message: error?.message });
    return actionError("No se pudo verificar. No se cambió nada; intenta de nuevo.");
  }
  if (!data.ok) {
    if (data.reason === "ya_vinculada") {
      return actionError(
        "Ese registro ya está vinculado a otra cuenta. Pide que la iglesia revise tu caso.",
      );
    }
    if (data.reason === "bloqueado" || data.reason === "vencido") {
      return actionError("El código venció o se agotaron los intentos. Pide un código nuevo.");
    }
    return actionError("El código no es correcto.");
  }
  revalidatePath("/", "layout");
  return actionOk(undefined);
}

/** Sin verificación: la iglesia revisa. La cuenta sigue funcionando igual. */
export async function requestIdentityReviewAction(input: {
  phone: string;
  birthDate: string;
  note: string;
}): Promise<ActionResult> {
  try {
    await requireAuth();
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }
  const parsed = identityReviewSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_identity_review", {
    p_phone: parsed.data.phone || null,
    p_birth: parsed.data.birthDate || null,
    p_note: parsed.data.note || null,
  });
  if (error) return actionError("No se pudo enviar la solicitud. Intenta de nuevo.");
  revalidatePath("/portal/vincular");
  return actionOk(undefined);
}
