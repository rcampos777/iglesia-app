import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listActivities } from "@/lib/data/activities";
import { listMinistries } from "@/lib/data/ministries";
import { activityStatusLabels } from "@/lib/labels";
import { activityStatusValues } from "@/lib/validations/activities";
import { getCurrentUser, hasAnyRole, hasRole, isStaff } from "@/lib/auth/session";
import type { ActivityStatus } from "@/types/database";

const ACTIVITY_MANAGE_ROLES = ["administrador", "coordinador_ministerio"] as const;

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  // Un miembro ve en /portal las actividades en las que está inscrito.
  if (!isStaff(user)) redirect("/portal");

  const params = await searchParams;
  const status = (params.status as ActivityStatus | "todas" | undefined) ?? "todas";

  // El pastor ve solo las actividades de los ministerios que lidera
  // (decisión 2026-09-02).
  const scopedToOwn = hasRole(user, "pastor") && !hasRole(user, "administrador");
  let ministryIds: string[] | undefined;
  if (scopedToOwn) {
    const led = user?.personId
      ? await listMinistries({ includeInactive: true, ledByPersonId: user.personId })
      : [];
    ministryIds = led.map((m) => m.id);
  }

  const activities = await listActivities({ status, ministryIds });
  const canCreate = hasAnyRole(user, [...ACTIVITY_MANAGE_ROLES]) || scopedToOwn;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Actividades</h1>
          <p className="text-muted-foreground">
            {scopedToOwn
              ? "Las actividades de los ministerios que lideras."
              : "Retiros, campañas, convivencias y demás eventos de la iglesia."}
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/actividades/nueva">
              <Plus className="mr-2 size-4" />
              Nueva actividad
            </Link>
          </Button>
        )}
      </div>

      <form method="get" className="flex gap-3">
        <Select name="status" defaultValue={status}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos los estados</SelectItem>
            {activityStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                {activityStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <div className="space-y-2">
        {activities.length === 0 && (
          <p className="text-muted-foreground">
            {scopedToOwn
              ? "No hay actividades en los ministerios que lideras."
              : "No hay actividades con este filtro."}
          </p>
        )}
        {activities.map((a) => (
          <Link key={a.id} href={`/actividades/${a.id}`} className="block">
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{a.name}</p>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-4" aria-hidden="true" />
                      {a.activity_date}
                      {a.start_time ? ` · ${a.start_time.slice(0, 5)}` : ""}
                    </span>
                    {a.ministryName && <span>{a.ministryName}</span>}
                    {a.location && <span>{a.location}</span>}
                    <span className="flex items-center gap-1">
                      <Users className="size-4" aria-hidden="true" />
                      {a.registeredCount} inscritos
                      {a.status === "realizada" ? ` · ${a.attendedCount} asistieron` : ""}
                    </span>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {activityStatusLabels[a.status]}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
