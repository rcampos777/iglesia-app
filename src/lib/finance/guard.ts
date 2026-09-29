import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { hasFinanceAccess, isApostol } from "@/lib/auth/finance";

/**
 * Guard de cada página financiera (no solo del layout: los layouts no se
 * vuelven a evaluar en cada navegación). Sin acceso → al panel, sin
 * revelar si el recurso existe.
 */
export async function requireFinancePage(
  opts: { apostolOnly?: boolean } = {},
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (opts.apostolOnly ? !isApostol(user) : !hasFinanceAccess(user)) redirect("/dashboard");
  return user;
}
