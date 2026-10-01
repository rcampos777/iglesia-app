import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClassOfferings } from "@/lib/data/courses";
import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole, hasDirectoryAccess, isStaff } from "@/lib/auth/session";
import { classTone } from "@/lib/status-tones";
import { StatusBadge } from "@/components/ui-brand/status-badge";

const MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

const statusLabels: Record<string, string> = {
  planificada: "Planificada",
  activa: "Activa",
  completada: "Completada",
  cancelada: "Cancelada",
};

export default async function CoursesPage() {
  const user = await getCurrentUser();
  // Un miembro ve SUS clases en /portal, no el catálogo completo.
  if (!isStaff(user)) redirect("/portal");

  // Pastor y maestro ven solo las clases que imparten; quien tiene el
  // directorio completo ve todas (decisiones 2026-09-02 y 2026-10-01).
  const scopedToOwn = !hasDirectoryAccess(user);
  const offerings = scopedToOwn
    ? user?.personId
      ? await listClassOfferings({ teacherPersonId: user.personId })
      : []
    : await listClassOfferings();
  const canManage = hasAnyRole(user, [...MANAGE_ROLES]);

  const byCategory = new Map<string, typeof offerings>();
  for (const offering of offerings) {
    const list = byCategory.get(offering.categoryName) ?? [];
    list.push(offering);
    byCategory.set(offering.categoryName, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">
            Cursos y clases
          </h1>
          <p className="text-muted-foreground">
            {scopedToOwn
              ? "Las clases que impartes."
              : "Hombres, mujeres, adoración, liderazgo y más."}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/cursos/nuevo">
                <Plus className="size-4" aria-hidden />
                Curso
              </Link>
            </Button>
            <Button asChild>
              <Link href="/cursos/clases/nueva">
                <Plus className="size-4" aria-hidden />
                Clase
              </Link>
            </Button>
          </div>
        )}
      </div>

      {offerings.length === 0 && (
        <p className="text-muted-foreground">
          {scopedToOwn
            ? "No impartes ninguna clase todavía. Aquí verás solo las clases donde eres el maestro."
            : "Todavía no hay clases creadas."}
        </p>
      )}

      {Array.from(byCategory.entries()).map(([category, categoryOfferings]) => (
        <div key={category} className="space-y-3">
          <h2 className="text-lg font-medium">{category}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categoryOfferings.map((offering) => (
              <Link key={offering.id} href={`/cursos/clases/${offering.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{offering.label}</CardTitle>
                      <StatusBadge tone={classTone[offering.status]}>
                        {statusLabels[offering.status]}
                      </StatusBadge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-muted-foreground space-y-1 text-sm">
                    <p>{offering.courseName}</p>
                    {offering.teacherName && <p>Maestro: {offering.teacherName}</p>}
                    {offering.schedule_text && <p>{offering.schedule_text}</p>}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
