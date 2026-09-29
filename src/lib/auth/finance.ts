import "server-only";
import type { AppRole } from "@/types/database";
import { hasAnyRole, hasRole, type CurrentUser } from "./session";

/**
 * Acceso financiero: SOLO `apostol` y `finanzas`. Un `administrador`
 * técnico no lo tiene. Espeja `has_finance_access()` / `is_apostol()` de
 * 0035, que son la barrera real (RLS + funciones de la base).
 */
export const FINANCE_ROLES: AppRole[] = ["apostol", "finanzas"];

export function hasFinanceAccess(user: CurrentUser | null): boolean {
  return hasAnyRole(user, FINANCE_ROLES);
}

export function isApostol(user: CurrentUser | null): boolean {
  return hasRole(user, "apostol");
}
