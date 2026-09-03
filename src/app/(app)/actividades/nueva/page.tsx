import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole, hasRole } from "@/lib/auth/session";
import { listMinistries, listPeopleForMinistryPicker } from "@/lib/data/ministries";
import { ActivityForm } from "../activity-form";

const ACTIVITY_MANAGE_ROLES = ["administrador", "coordinador_ministerio"] as const;

export default async function NewActivityPage() {
  const user = await getCurrentUser();

  const isGlobalManager = hasAnyRole(user, [...ACTIVITY_MANAGE_ROLES]);
  const scopedToOwn = hasRole(user, "pastor") && !hasRole(user, "administrador");
  if (!isGlobalManager && !scopedToOwn) redirect("/actividades");

  // Un pastor solo puede colgar la actividad de un ministerio que lidera.
  const [people, ministries] = await Promise.all([
    listPeopleForMinistryPicker(),
    scopedToOwn
      ? user?.personId
        ? listMinistries({ includeInactive: true, ledByPersonId: user.personId })
        : Promise.resolve([])
      : listMinistries({ includeInactive: true }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva actividad</h1>
        <p className="text-muted-foreground">
          Un evento puntual: retiro, campaña, convivencia, jornada. Después podrás inscribir gente y
          pasar lista.
        </p>
      </div>
      <ActivityForm
        people={people}
        ministries={ministries.map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}
