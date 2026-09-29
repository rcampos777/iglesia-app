import { redirect } from "next/navigation";
import { PersonForm } from "@/components/people/person-form";
import { createPersonAction } from "../actions";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";

const WRITE_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export default async function NewPersonPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...WRITE_ROLES])) {
    redirect("/portal");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Nueva persona</h1>
        <p className="text-muted-foreground">Registra un miembro, visitante u otra persona.</p>
      </div>
      <div className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-6">
        <PersonForm action={createPersonAction} submitLabel="Crear persona" />
      </div>
    </div>
  );
}
