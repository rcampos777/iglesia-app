import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PendingPortalInvitation {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export interface PortalAccountStatus {
  hasAccount: boolean;
  pendingInvitation: PendingPortalInvitation | null;
}

/**
 * Estado del portal de una persona: si ya tiene cuenta vinculada
 * (profiles) o si hay una invitación pendiente (ni usada ni revocada).
 * Usado en la ficha de persona para decidir qué botón mostrar — nunca
 * expone el token, solo su metadata.
 */
export async function getPortalAccountStatus(personId: string): Promise<PortalAccountStatus> {
  const supabase = await createClient();

  const [{ data: profile }, { data: invitation }] = await Promise.all([
    supabase.from("profiles").select("id").eq("person_id", personId).maybeSingle(),
    supabase
      .from("portal_invitations")
      .select("id, email, created_at, expires_at")
      .eq("person_id", personId)
      .is("used_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    hasAccount: !!profile,
    pendingInvitation: invitation
      ? {
          id: invitation.id,
          email: invitation.email,
          createdAt: invitation.created_at,
          expiresAt: invitation.expires_at,
        }
      : null,
  };
}
