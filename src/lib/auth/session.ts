import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export interface CurrentUser {
  userId: string;
  email: string | null;
  personId: string | null;
  roles: AppRole[];
}

/**
 * Sesión + roles del usuario autenticado actual, para usar en Server
 * Components y Server Actions. Devuelve null si no hay sesión.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("person_id").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    personId: profile?.person_id ?? null,
    roles: (roleRows ?? []).map((r) => r.role),
  };
}

/** `apostol` = todos los permisos (espeja has_role/has_any_role de 0036). */
function isApostolRole(user: CurrentUser | null): boolean {
  return user?.roles.includes("apostol") ?? false;
}

export function hasRole(user: CurrentUser | null, role: AppRole): boolean {
  return isApostolRole(user) || (user?.roles.includes(role) ?? false);
}

export function hasAnyRole(user: CurrentUser | null, roles: AppRole[]): boolean {
  return isApostolRole(user) || (user ? user.roles.some((r) => roles.includes(r)) : false);
}

export const STAFF_ROLES: AppRole[] = [
  "maestro",
  "seguimiento",
  "intercesor",
  "coordinador_ministerio",
  "pastor",
  "administrador",
];

/**
 * Directorio completo de personas. Espeja `has_directory_access()` (0045):
 * `pastor` y `maestro` NO — solo ven a las personas a su cargo.
 */
export const DIRECTORY_ROLES: AppRole[] = [
  "administrador",
  "seguimiento",
  "intercesor",
  "coordinador_ministerio",
];

export function hasDirectoryAccess(user: CurrentUser | null): boolean {
  return hasAnyRole(user, DIRECTORY_ROLES);
}

/**
 * Espeja `is_admin()` en la base (0023): solo `administrador`. El rol
 * `pastor` quedó acotado a sus clases y ministerios — en esta iglesia hay
 * muchos pastores de área y varios sin nada a su cargo.
 */
export const ADMIN_ROLES: AppRole[] = ["administrador"];

export function isStaff(user: CurrentUser | null): boolean {
  return hasAnyRole(user, STAFF_ROLES);
}

export function isAdmin(user: CurrentUser | null): boolean {
  return hasAnyRole(user, ADMIN_ROLES);
}
