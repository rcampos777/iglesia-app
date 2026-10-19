import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { NewFollowUpForm } from "./new-follow-up-form";

// Sin `pastor` desde 0045: Visitantes es de Seguimiento (decisión 2026-10-01).
const FOLLOWUP_ROLES = ["administrador", "coordinador_ministerio", "seguimiento"] as const;

export default async function NewFollowUpPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...FOLLOWUP_ROLES])) redirect("/visitantes");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">
          Nuevo seguimiento
        </h1>
        <p className="text-muted-foreground">
          Registra la visita de una persona nueva o de alguien que ya está en el directorio.
        </p>
      </div>
      <div className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-6">
        <NewFollowUpForm />
      </div>
    </div>
  );
}
