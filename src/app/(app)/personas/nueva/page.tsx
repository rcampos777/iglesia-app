import { redirect } from "next/navigation";
import { PersonForm } from "@/components/people/person-form";
import { createPersonAction } from "../actions";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";

const WRITE_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export default async function NewPersonPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...WRITE_ROLES])) {
    redirect("/personas");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva persona</h1>
        <p className="text-muted-foreground">Registra un miembro, visitante u otra persona.</p>
      </div>
      <PersonForm action={createPersonAction} submitLabel="Crear persona" />
    </div>
  );
}
