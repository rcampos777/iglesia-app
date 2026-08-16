import "server-only";
import type { AppRole } from "@/types/database";
import { getCurrentUser, hasAnyRole, type CurrentUser } from "./session";

export class AuthError extends Error {}

/**
 * Guard de autorización para Server Actions / Route Handlers. Lanza
 * AuthError con un mensaje en español si no hay sesión o el usuario no
 * tiene ninguno de los roles permitidos. Esta es la primera línea de
 * defensa; RLS en la base de datos es la segunda e independiente (ver
 * docs/security.md).
 */
export async function requireRole(allowedRoles: AppRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthError("Debes iniciar sesión para continuar.");
  }

  if (!hasAnyRole(user, allowedRoles)) {
    throw new AuthError("No tienes permiso para realizar esta acción.");
  }

  return user;
}

export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Debes iniciar sesión para continuar.");
  }
  return user;
}
