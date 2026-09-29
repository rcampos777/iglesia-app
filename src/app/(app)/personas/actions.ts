"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { personSchema } from "@/lib/validations/people";
import { findDuplicateCandidates, getPerson, type DuplicateCandidate } from "@/lib/data/people";
import { sendEmail } from "@/lib/email/send";
import type { AppRole, PersonInsert } from "@/types/database";
import { z } from "zod";

const PEOPLE_WRITE_ROLES = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "seguimiento",
] as const;

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

function toPersonInsert(data: ReturnType<typeof personSchema.parse>): PersonInsert {
  return {
    first_name: data.firstName,
    last_name: data.lastName,
    preferred_name: data.preferredName || null,
    birth_date: data.birthDate || null,
    gender: data.gender || null,
    email: data.email || null,
    phone: data.phone || null,
    address_line: data.addressLine || null,
    city: data.city || null,
    marital_status: data.maritalStatus || null,
    membership_status: data.membershipStatus,
    joined_at: data.joinedAt || null,
    notes: data.notes || null,
    photo_url: null,
  };
}

export interface CreatePersonResult {
  duplicates?: DuplicateCandidate[];
}

export async function createPersonAction(
  formData: FormData,
): Promise<ActionResult<CreatePersonResult>> {
  try {
    await requireRole([...PEOPLE_WRITE_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = personSchema.safeParse(raw);

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const confirmDuplicate = formData.get("confirmDuplicate") === "true";

  if (!confirmDuplicate && (parsed.data.email || parsed.data.phone)) {
    const duplicates = await findDuplicateCandidates({
      email: parsed.data.email || undefined,
      phone: parsed.data.phone || undefined,
    });

    if (duplicates.length > 0) {
      // No es un error: requiere confirmación humana antes de crear un
      // posible duplicado (nunca se fusiona/crea automáticamente).
      return actionOk({ duplicates });
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: person, error } = await supabase
    .from("people")
    .insert({ ...toPersonInsert(parsed.data), created_by: user?.id ?? null })
    .select("id")
    .single();

  if (error || !person) {
    return actionError(`No se pudo crear la persona: ${error?.message ?? "error desconocido"}`);
  }

  revalidatePath("/personas");
  redirect(`/personas/${person.id}`);
}

export async function updatePersonAction(
  personId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireRole([...PEOPLE_WRITE_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const raw = Object.fromEntries(formData.entries());
  const parsed = personSchema.safeParse(raw);

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("people")
    .update({ ...toPersonInsert(parsed.data), updated_by: user?.id ?? null })
    .eq("id", personId);

  if (error) {
    return actionError(`No se pudo guardar: ${error.message}`);
  }

  revalidatePath("/personas");
  revalidatePath(`/personas/${personId}`);
  return actionOk(undefined);
}

export async function sendPersonEmailAction(
  personId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await (async () => {
    try {
      return await requireRole([...PEOPLE_WRITE_ROLES]);
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!user) return actionError("No tienes permiso para enviar emails.");

  const subject = formData.get("subject");
  const message = formData.get("message");
  if (typeof subject !== "string" || !subject.trim()) return actionError("Escribe un asunto.");
  if (typeof message !== "string" || !message.trim()) return actionError("Escribe un mensaje.");

  const person = await getPerson(personId);
  if (!person?.email) return actionError("Esta persona no tiene email registrado.");

  const result = await sendEmail({
    to: person.email,
    subject,
    html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
    recipientPersonId: personId,
    relatedEntityType: "people",
    relatedEntityId: personId,
    createdBy: user.userId,
  });

  if (!result.ok) return actionError(`No se pudo enviar el email: ${result.error}`);

  return actionOk(undefined);
}

const inviteEmailSchema = z
  .string()
  .trim()
  .min(1, "El email es requerido.")
  .email("Email inválido.");

export interface InvitePortalResult {
  token: string;
  appUrl: string;
}

/**
 * Invitación verificable para activar el portal de una persona ya
 * existente (fase 1.A). El token en crudo solo se devuelve aquí, una
 * vez; la base solo guarda su hash (create_portal_invitation, 0027).
 * Nunca crea una cuenta directamente ni confía en person_id enviado por
 * el cliente que se registra: eso lo revisa la Admin API en
 * activar-portal/actions.ts.
 */
export async function invitePersonToPortalAction(
  personId: string,
  formData: FormData,
): Promise<ActionResult<InvitePortalResult>> {
  try {
    await requireRole([...PEOPLE_WRITE_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const parsedEmail = inviteEmailSchema.safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    const message = parsedEmail.error.issues[0]?.message ?? "Ingresa un email válido.";
    return actionError("Ingresa un email válido.", { email: [message] });
  }

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_portal_invitation", {
    p_person_id: personId,
    p_email: parsedEmail.data,
  });

  if (error || !token) {
    return actionError(`No se pudo crear la invitación: ${error?.message ?? "error desconocido"}`);
  }

  revalidatePath(`/personas/${personId}`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return actionOk({ token, appUrl });
}

export async function revokePortalInvitationAction(
  personId: string,
  invitationId: string,
): Promise<ActionResult> {
  try {
    await requireRole([...PEOPLE_WRITE_ROLES]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_portal_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) return actionError(`No se pudo revocar la invitación: ${error.message}`);

  revalidatePath(`/personas/${personId}`);
  return actionOk(undefined);
}

const MANAGEABLE_ROLES: AppRole[] = [
  "miembro",
  "maestro",
  "seguimiento",
  "intercesor",
  "coordinador_ministerio",
  "pastor",
  "administrador",
  "ujier",
  "gestion_cultos",
  "control_checkin",
  "correccion_asistencia",
];

function sortRoles(roles: AppRole[]): AppRole[] {
  return [...new Set(roles)].sort();
}

function rolesEqual(a: AppRole[], b: AppRole[]): boolean {
  const sa = sortRoles(a);
  const sb = sortRoles(b);
  return sa.length === sb.length && sa.every((r, i) => r === sb[i]);
}

export interface SavePersonRolesResult {
  roles: AppRole[];
}

/**
 * Guardado transaccional de "Cuenta y permisos" → Permisos de la
 * aplicación. Este guard de Server Action es defensa en profundidad:
 * la verificación real (y la única que importa para la seguridad) vive
 * en `admin_set_person_roles()` (0030), que vuelve a chequear
 * `is_admin()` en el servidor de base de datos antes de tocar nada.
 *
 * `expectedRoles` es el conjunto que el cliente tenía cargado cuando
 * abrió la pestaña; si ya no coincide con lo que hay en la base, la
 * función SQL rechaza con `STALE_ROLES:` para no sobrescribir en
 * silencio el cambio de otro administrador — ese prefijo se traduce
 * aquí a un mensaje que la UI puede detectar y ofrecer "recargar".
 */
export async function savePersonRolesAction(
  personId: string,
  expectedRoles: AppRole[],
  newRoles: AppRole[],
): Promise<ActionResult<SavePersonRolesResult>> {
  try {
    await requireRole(["administrador"]);
  } catch (err) {
    if (err instanceof AuthError) return actionError(err.message);
    throw err;
  }

  const cleanExpected = expectedRoles.filter((r): r is AppRole => MANAGEABLE_ROLES.includes(r));
  const cleanNew = newRoles.filter((r): r is AppRole => MANAGEABLE_ROLES.includes(r));

  if (rolesEqual(cleanExpected, cleanNew)) {
    return actionOk({ roles: sortRoles(cleanExpected) });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_person_roles", {
    p_person_id: personId,
    p_expected_roles: cleanExpected,
    p_new_roles: cleanNew,
  });

  if (error) {
    if (error.message.startsWith("STALE_ROLES:")) {
      return actionError(
        "Los permisos de esta cuenta cambiaron mientras editabas. Recarga la página e intenta de nuevo.",
      );
    }
    return actionError(`No se pudieron guardar los cambios: ${error.message}`);
  }

  revalidatePath(`/personas/${personId}`);
  revalidatePath("/admin");
  return actionOk({ roles: sortRoles(cleanNew) });
}
