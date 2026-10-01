import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatBarList } from "@/components/dashboard/stat-bar-list";
import { getCurrentUser, hasAnyRole, isStaff } from "@/lib/auth/session";
import {
  getEnrollmentCountsByClass,
  getMinistryServingCounts,
  getRecentActivityParticipation,
  getFollowUpsByStatus,
  getPeopleByStatus,
  getPrayerRequestsByStatus,
  getRecentServiceAttendance,
  getServiceAttendanceReport,
} from "@/lib/data/reports";
import { addDaysToDateKey, churchDateKey, formatDateKey, formatLocalTime } from "@/lib/datetime";
import { serviceTypeLabels } from "@/lib/labels";
import type { ServiceType } from "@/types/database";
import { AttendanceReportFilters } from "./attendance-report-filters";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FOLLOWUP_ROLES = ["seguimiento", "coordinador_ministerio", "administrador"] as const;
const PRAYER_ROLES = ["intercesor", "pastor", "administrador"] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; tipo?: string }>;
}) {
  const user = await getCurrentUser();
  if (!isStaff(user)) redirect("/dashboard");

  const params = await searchParams;
  const today = churchDateKey();
  let from =
    params.desde && DATE_RE.test(params.desde) ? params.desde : addDaysToDateKey(today, -30);
  let to = params.hasta && DATE_RE.test(params.hasta) ? params.hasta : today;
  if (from > to) [from, to] = [to, from];
  const type =
    params.tipo && params.tipo in serviceTypeLabels ? (params.tipo as ServiceType) : null;

  const canSeeFollowUps = hasAnyRole(user, [...FOLLOWUP_ROLES]);
  const canSeePrayer = hasAnyRole(user, [...PRAYER_ROLES]);

  const [
    peopleByStatus,
    enrollmentCounts,
    serviceAttendance,
    followUpsByStatus,
    prayerByStatus,
    ministryCounts,
    activityParticipation,
    attendanceReport,
  ] = await Promise.all([
    getPeopleByStatus(),
    getEnrollmentCountsByClass(),
    getRecentServiceAttendance(),
    canSeeFollowUps ? getFollowUpsByStatus() : Promise.resolve([]),
    canSeePrayer ? getPrayerRequestsByStatus() : Promise.resolve([]),
    getMinistryServingCounts(),
    getRecentActivityParticipation(),
    getServiceAttendanceReport(from, to, type),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Reportes</h1>
        <p className="text-muted-foreground">Vista general de la congregación.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asistencia a cultos por fecha y tipo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AttendanceReportFilters from={from} to={to} type={type ?? "todos"} />
          <dl className="grid grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <dt className="text-muted-foreground text-sm">Cultos</dt>
              <dd className="text-xl font-semibold tabular-nums">{attendanceReport.rows.length}</dd>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <dt className="text-muted-foreground text-sm">Asistencias</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {attendanceReport.totalAttendance}
              </dd>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <dt className="text-muted-foreground text-sm">Personas distintas</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {attendanceReport.uniquePeople}
              </dd>
            </div>
          </dl>
          {attendanceReport.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hay cultos en este período.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Culto</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Tipo</th>
                    <th className="px-3 py-2 text-right font-medium">Asistencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {attendanceReport.rows.map((r) => (
                    <tr key={r.serviceId}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDateKey(r.date, false)}
                        {r.startTime ? ` · ${formatLocalTime(r.startTime)}` : ""}
                      </td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="text-muted-foreground hidden px-3 py-2 sm:table-cell">
                        {serviceTypeLabels[r.serviceType]}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.attendance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Asistencia a actividades realizadas</CardTitle>
          </CardHeader>
          <CardContent>
            <StatBarList
              data={activityParticipation.map((a) => ({
                label: `${a.activityName} (${a.registered} inscritos)`,
                count: a.attended,
              }))}
              emptyMessage="Todavía no hay actividades realizadas."
            />
          </CardContent>
        </Card>

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
                label: `${s.label} (${formatDateKey(s.date, false)})`,
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
