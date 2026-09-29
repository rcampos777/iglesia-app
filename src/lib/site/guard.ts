import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole, type CurrentUser } from "@/lib/auth/session";

export const SITE_EDIT_ROLES = ["administrador", "sitio_web"] as const;

/** Cada página del editor revalida (SuperAdmin pasa por hasAnyRole). */
export async function requireSiteEditor(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasAnyRole(user, [...SITE_EDIT_ROLES])) redirect("/dashboard");
  return user;
}
