import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { listCourses } from "@/lib/data/courses";
import { listPeople } from "@/lib/data/people";
import { NewClassOfferingForm } from "./new-offering-form";

const MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export default async function NewClassOfferingPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...MANAGE_ROLES])) redirect("/cursos");

  const [courses, peopleResult] = await Promise.all([listCourses(), listPeople({ limit: 200 })]);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Nueva clase</h1>
        <p className="text-muted-foreground">Crea una cohorte/instancia de un curso existente.</p>
      </div>
      <div className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-6">
        <NewClassOfferingForm courses={courses} people={peopleResult.people} />
      </div>
    </div>
  );
}
