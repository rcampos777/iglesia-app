import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { listPeopleForMinistryPicker } from "@/lib/data/ministries";
import { MinistryForm } from "../ministry-form";

const MINISTRY_ADMIN_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export default async function NewMinistryPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...MINISTRY_ADMIN_ROLES])) redirect("/ministerios");

  const people = await listPeopleForMinistryPicker();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo ministerio</h1>
        <p className="text-muted-foreground">
          Registra un área de servicio de la iglesia. Después podrás agregar a las personas que
          sirven en ella.
        </p>
      </div>
      <MinistryForm people={people} />
    </div>
  );
}
