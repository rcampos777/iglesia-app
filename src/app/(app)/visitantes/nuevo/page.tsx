import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { listPeople } from "@/lib/data/people";
import { NewFollowUpForm } from "./new-follow-up-form";

// Sin `pastor` desde 0045: Visitantes es de Seguimiento (decisión 2026-10-01).
const FOLLOWUP_ROLES = ["administrador", "coordinador_ministerio", "seguimiento"] as const;

export default async function NewFollowUpPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...FOLLOWUP_ROLES])) redirect("/visitantes");

  const { people } = await listPeople({ status: "visitante", limit: 200 });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">
          Nuevo seguimiento
        </h1>
        <p className="text-muted-foreground">
          Elige a la persona a dar seguimiento. ¿No está en el directorio?{" "}
          <Link href="/personas/nueva" className="text-primary underline underline-offset-4">
            Regístrala primero
          </Link>
          .
        </p>
      </div>
      <div className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-6">
        <NewFollowUpForm people={people} />
      </div>
    </div>
  );
}
