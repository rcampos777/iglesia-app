import {
  UserPlus,
  DoorOpen,
  PhoneCall,
  GraduationCap,
  HeartHandshake,
  CalendarCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  membershipStatusLabels,
  followupStatusLabels,
  ministryMemberRoleLabels,
} from "@/lib/labels";
import type { JourneyEventKind, PersonJourney } from "@/lib/data/journey";
import type { MinistryMemberRole } from "@/types/database";

const KIND_ICON: Record<JourneyEventKind, typeof UserPlus> = {
  registro: UserPlus,
  primera_visita: DoorOpen,
  seguimiento: PhoneCall,
  curso: GraduationCap,
  ministerio: HeartHandshake,
  actividad: CalendarCheck,
};

const ENROLLMENT_LABELS: Record<string, string> = {
  inscrito: "Inscrito",
  en_progreso: "En progreso",
  completado: "Completado",
  retirado: "Retirado",
};

function formatDate(value: string) {
  // Se construye en UTC a propósito: las fechas vienen como YYYY-MM-DD y
  // `new Date("2026-08-22")` en local puede retroceder un día.
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function PersonJourneyCard({ journey }: { journey: PersonJourney }) {
  const { current, formation, events } = journey;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dónde está hoy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground text-sm">Estatus</p>
              <p className="font-medium">{membershipStatusLabels[current.membershipStatus]}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Cursos completados</p>
              <p className="font-medium">
                {current.coursesCompleted}
                {current.coursesInProgress > 0 && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    (+{current.coursesInProgress} en curso)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Actividades</p>
              <p className="font-medium">{current.activitiesAttended} asistidas</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Check-ins</p>
              <p className="font-medium">
                {current.checkinCount}
                {current.lastCheckin && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · último {formatDate(current.lastCheckin)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-muted-foreground mb-2 text-sm">Sirve en</p>
            {current.ministries.length === 0 ? (
              <p className="text-sm">
                Todavía no sirve en ningún ministerio.{" "}
                <span className="text-muted-foreground">
                  Es la señal de que el siguiente paso podría ser integrarla a un equipo.
                </span>
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {current.ministries.map((m) => (
                  <li key={m.name} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground">
                      {ministryMemberRoleLabels[m.role as MinistryMemberRole] ?? m.role} · desde{" "}
                      {formatDate(m.since)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {current.followUpStatus && (
            <p className="text-muted-foreground border-t pt-4 text-sm">
              Seguimiento de visitante: {followupStatusLabels[current.followUpStatus]}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ruta de formación</CardTitle>
        </CardHeader>
        <CardContent>
          {formation.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no se ha matriculado en ningún curso.
            </p>
          ) : (
            <ol className="space-y-3">
              {formation.map((f, i) => (
                <li key={`${f.classLabel}-${i}`} className="flex items-start gap-3">
                  <span className="bg-muted mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{f.courseName}</p>
                      <Badge variant="outline">{ENROLLMENT_LABELS[f.status] ?? f.status}</Badge>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {f.categoryName} · {f.classLabel} · {f.attendancePercent}% de asistencia
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Línea de tiempo</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            {events.map((e, i) => {
              const Icon = KIND_ICON[e.kind];
              return (
                <li key={`${e.date}-${i}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    {i < events.length - 1 && <span className="bg-border mt-1 w-px flex-1" />}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-muted-foreground text-sm">
                      {formatDate(e.date)}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
