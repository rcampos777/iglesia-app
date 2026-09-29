import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { hasFinanceAccess, isApostol } from "@/lib/auth/finance";
import { FinanceTabs } from "./finance-tabs";

// Cada página vuelve a validar el acceso (requireFinancePage); aquí solo
// se decide si se dibujan las pestañas.
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!hasFinanceAccess(user)) return children;
  return (
    <div className="space-y-6">
      <FinanceTabs showAccess={isApostol(user)} />
      {children}
    </div>
  );
}
