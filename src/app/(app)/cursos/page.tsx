import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClassOfferings } from "@/lib/data/courses";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";

const MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

const statusLabels: Record<string, string> = {
  planificada: "Planificada",
  activa: "Activa",
  completada: "Completada",
  cancelada: "Cancelada",
};

export default async function CoursesPage() {
  const [user, offerings] = await Promise.all([getCurrentUser(), listClassOfferings()]);
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
          <h1 className="text-2xl font-semibold tracking-tight">Cursos y clases</h1>
          <p className="text-muted-foreground">Hombres, mujeres, adoración, liderazgo y más.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/cursos/nuevo">
                <Plus className="mr-2 size-4" />
                Curso
              </Link>
            </Button>
            <Button asChild>
              <Link href="/cursos/clases/nueva">
                <Plus className="mr-2 size-4" />
                Clase
              </Link>
            </Button>
          </div>
        )}
      </div>

      {offerings.length === 0 && (
        <p className="text-muted-foreground">Todavía no hay clases creadas.</p>
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
                      <Badge variant="outline">{statusLabels[offering.status]}</Badge>
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
