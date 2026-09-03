import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatBarList } from "@/components/dashboard/stat-bar-list";
import { getCurrentUser, hasAnyRole, isStaff } from "@/lib/auth/session";
import {
  getEnrollmentCountsByClass,
  getMinistryServingCounts,
  getFollowUpsByStatus,
  getPeopleByStatus,
  getPrayerRequestsByStatus,
  getRecentServiceAttendance,
} from "@/lib/data/reports";

const FOLLOWUP_ROLES = [
  "seguimiento",
  "coordinador_ministerio",
  "pastor",
  "administrador",
] as const;
const PRAYER_ROLES = ["intercesor", "pastor", "administrador"] as const;

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!isStaff(user)) redirect("/dashboard");

  const canSeeFollowUps = hasAnyRole(user, [...FOLLOWUP_ROLES]);
  const canSeePrayer = hasAnyRole(user, [...PRAYER_ROLES]);

  const [
    peopleByStatus,
    enrollmentCounts,
    serviceAttendance,
    followUpsByStatus,
    prayerByStatus,
    ministryCounts,
  ] = await Promise.all([
    getPeopleByStatus(),
    getEnrollmentCountsByClass(),
    getRecentServiceAttendance(),
    canSeeFollowUps ? getFollowUpsByStatus() : Promise.resolve([]),
    canSeePrayer ? getPrayerRequestsByStatus() : Promise.resolve([]),
    getMinistryServingCounts(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground">Vista general de la congregación.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personas sirviendo por ministerio</CardTitle>
          </CardHeader>
          <CardContent>
            <StatBarList
              data={ministryCounts.map((m) => ({
                label: m.ministryName,
                count: m.activeMembers,
              }))}
              emptyMessage="Todavía no hay personas registradas en ministerios."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personas por estatus</CardTitle>
          </CardHeader>
          <CardContent>
            <StatBarList data={peopleByStatus} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matrícula por clase activa</CardTitle>
          </CardHeader>
          <CardContent>
            <StatBarList data={enrollmentCounts} emptyMessage="No hay clases activas todavía." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Asistencia a servicios recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <StatBarList
              data={serviceAttendance.map((s) => ({
                label: `${s.label} (${new Date(s.date + "T00:00:00").toLocaleDateString("es")})`,
                count: s.count,
              }))}
              emptyMessage="No hay servicios registrados todavía."
            />
          </CardContent>
        </Card>

        {canSeeFollowUps && (
          <Card>
            <CardHeader>
              <CardTitle>Seguimiento de visitantes por estatus</CardTitle>
            </CardHeader>
            <CardContent>
              <StatBarList data={followUpsByStatus} />
            </CardContent>
          </Card>
        )}

        {canSeePrayer && (
          <Card>
            <CardHeader>
              <CardTitle>Peticiones de oración por estatus</CardTitle>
            </CardHeader>
            <CardContent>
              <StatBarList data={prayerByStatus} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
