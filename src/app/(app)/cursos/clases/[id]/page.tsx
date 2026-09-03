import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getClassOfferingDetail } from "@/lib/data/courses";
import { listPeople } from "@/lib/data/people";
import { getCurrentUser, hasAnyRole, hasRole, isStaff } from "@/lib/auth/session";
import { EnrollForm } from "./enroll-form";
import { AttendancePanel } from "./attendance-panel";
import { AddSessionForm } from "./add-session-form";

const TEACH_ROLES = ["administrador", "pastor", "coordinador_ministerio", "maestro"] as const;
const ENROLL_ROLES = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "maestro",
  "seguimiento",
] as const;

export default async function ClassOfferingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isStaff(user)) redirect("/portal");

  const detail = await getClassOfferingDetail(id);

  // El pastor solo abre las clases que él imparte.
  if (
    detail &&
    hasRole(user, "pastor") &&
    !hasRole(user, "administrador") &&
    detail.offering.teacher_person_id !== user?.personId
  ) {
    redirect("/cursos");
  }

  if (!detail) notFound();

  const canTeach = hasAnyRole(user, [...TEACH_ROLES]);
  const canEnroll = hasAnyRole(user, [...ENROLL_ROLES]);

  const { offering, sessions, enrollments, attendance } = detail;

  const enrolledPersonIds = new Set(enrollments.map((e) => e.person_id));
  const peopleResult = canEnroll ? await listPeople({ limit: 200 }) : { people: [] };
  const availablePeople = peopleResult.people.filter((p) => !enrolledPersonIds.has(p.id));

  const attendanceByPerson = new Map<string, { attended: number; total: number }>();
  for (const e of enrollments) {
    const records = attendance.filter((a) => a.person_id === e.person_id);
    const attended = records.filter((r) => r.status === "presente" || r.status === "tarde").length;
    attendanceByPerson.set(e.person_id, { attended, total: sessions.length });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{offering.label}</h1>
          <p className="text-muted-foreground">
            {offering.courseName} · {offering.categoryName}
          </p>
        </div>
        <Badge variant="outline">{offering.status}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        {offering.teacherName && (
          <p>
            <span className="text-muted-foreground">Maestro:</span> {offering.teacherName}
          </p>
        )}
        {offering.schedule_text && (
          <p>
            <span className="text-muted-foreground">Horario:</span> {offering.schedule_text}
          </p>
        )}
        {offering.location && (
          <p>
            <span className="text-muted-foreground">Lugar:</span> {offering.location}
          </p>
        )}
        {offering.capacity && (
          <p>
            <span className="text-muted-foreground">Cupo:</span> {enrollments.length}/
            {offering.capacity}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matrícula ({enrollments.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEnroll && <EnrollForm offeringId={offering.id} people={availablePeople} />}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead className="text-right">Asistencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                      Sin matrículas todavía.
                    </TableCell>
                  </TableRow>
                )}
                {enrollments.map((e) => {
                  const stats = attendanceByPerson.get(e.person_id);
                  const pct =
                    stats && stats.total > 0 ? Math.round((stats.attended / stats.total) * 100) : 0;
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        {e.personFirstName} {e.personLastName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{e.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{pct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesiones y asistencia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canTeach && <AddSessionForm offeringId={offering.id} />}
          {sessions.length === 0 && (
            <p className="text-muted-foreground">Todavía no hay sesiones registradas.</p>
          )}
          {sessions.length > 0 && (
            <AttendancePanel
              offeringId={offering.id}
              sessions={sessions}
              enrollments={enrollments}
              attendance={attendance}
              canTeach={canTeach}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
