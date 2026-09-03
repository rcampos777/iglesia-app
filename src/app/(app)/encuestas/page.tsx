import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listSurveys } from "@/lib/data/surveys";
import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole, isStaff } from "@/lib/auth/session";

const SURVEY_MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export default async function SurveysPage() {
  const user = await getCurrentUser();
  if (!isStaff(user)) redirect("/portal");

  const surveys = await listSurveys();
  const canManage = hasAnyRole(user, [...SURVEY_MANAGE_ROLES]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Encuestas</h1>
          <p className="text-muted-foreground">Comparte tu opinión con la congregación.</p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/encuestas/nueva">
              <Plus className="mr-2 size-4" />
              Nueva encuesta
            </Link>
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {surveys.length === 0 && <p className="text-muted-foreground">No hay encuestas todavía.</p>}
        {surveys.map((s) => (
          <Link key={s.id} href={`/encuestas/${s.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{s.title}</p>
                  {s.description && (
                    <p className="text-muted-foreground text-sm">{s.description}</p>
                  )}
                </div>
                {!s.is_active && <Badge variant="outline">Cerrada</Badge>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
