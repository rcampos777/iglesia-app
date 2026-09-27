"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { actionError, type ActionResult } from "@/lib/action-result";
import { acceptInvitationSchema } from "@/lib/validations/auth";

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

/**
 * Activa el portal de una persona YA EXISTENTE a partir de una
 * invitación verificable (fase 1.A). No hay sesión todavía — por eso
 * usa la service_role key (justificado: es el único punto donde una
 * cuenta se crea antes de que exista cualquier sesión de usuario, ver
 * src/lib/supabase/admin.ts).
 *
 * Nunca confía en un person_id que llegue del formulario: el único
 * person_id que se usa es el que ya estaba guardado (hasheado) junto al
 * token en portal_invitations, creado por un miembro del staff
 * autenticado (create_portal_invitation, 0027). El nuevo auth.users se
 * crea con `app_metadata.person_id` (nunca `user_metadata`), que es el
 * único campo que el trigger `handle_new_auth_user` acepta como enlace
 * a una persona existente — ver 0027_identity_protection.sql.
 */
export async function acceptPortalInvitationAction(formData: FormData): Promise<ActionResult> {
  const parsed = acceptInvitationSchema.safeParse({
    token: formData.get("token"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const { token, password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const admin = createAdminClient();

  const { data: invitation, error: lookupError } = await admin
    .from("portal_invitations")
    .select("id, person_id, email, expires_at, used_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (lookupError || !invitation) {
    return actionError("El enlace de invitación no es válido.");
  }
  if (invitation.used_at || invitation.revoked_at) {
    return actionError("Este enlace ya fue usado o fue revocado. Pide uno nuevo al staff.");
  }
  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    return actionError("El enlace de invitación expiró. Pide uno nuevo al staff.");
  }
  if (invitation.email.toLowerCase() !== email) {
    return actionError("El email no coincide con la invitación.");
  }

  // Defensa en profundidad: la persona debe seguir sin cuenta. Evita
  // una condición de carrera si dos invitaciones se aceptaran a la vez.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("person_id", invitation.person_id)
    .maybeSingle();

  if (existingProfile) {
    return actionError("Esta persona ya tiene una cuenta activa. Contacta a un administrador.");
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // app_metadata (raw_app_meta_data): SOLO la Admin API puede
    // escribirlo. Es la única forma en que handle_new_auth_user()
    // vincula la cuenta nueva a un person_id existente — ver 0027.
    app_metadata: { person_id: invitation.person_id },
  });

  if (createError || !created?.user) {
    if (createError?.message?.toLowerCase().includes("already")) {
      return actionError("Ya existe una cuenta con ese email.");
    }
    return actionError("No se pudo activar el portal. Intenta de nuevo o pide un enlace nuevo.");
  }

  await admin
    .from("portal_invitations")
    .update({ used_at: new Date().toISOString(), used_by_user_id: created.user.id })
    .eq("id", invitation.id);

  await admin.rpc("log_audit_event", {
    p_action: "accept_portal_invitation",
    p_entity_type: "people",
    p_entity_id: invitation.person_id,
    p_metadata: { user_id: created.user.id },
  });

  // Inicia sesión con el cliente normal (respeta cookies/SSR) para que
  // la persona llegue al portal ya autenticada.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    redirect("/login?activated=1");
  }

  redirect("/portal");
}
