import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { listPeople } from "@/lib/data/people";
import { NewFollowUpForm } from "./new-follow-up-form";

const FOLLOWUP_ROLES = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "seguimiento",
] as const;

export default async function NewFollowUpPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...FOLLOWUP_ROLES])) redirect("/visitantes");

  const { people } = await listPeople({ status: "visitante", limit: 200 });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo seguimiento</h1>
        <p className="text-muted-foreground">
          Elige a la persona a dar seguimiento. ¿No está en el directorio?{" "}
          <Link href="/personas/nueva" className="underline">
            Regístrala primero
          </Link>
          .
        </p>
      </div>
      <NewFollowUpForm people={people} />
    </div>
  );
}
