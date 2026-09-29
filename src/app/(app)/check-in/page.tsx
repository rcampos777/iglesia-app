import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CalendarDays, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { EmptyState } from "@/components/ui-brand/table-card";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { ATTENDANCE_AREA_ROLES, attendanceCapabilities } from "@/lib/auth/attendance";
import {
  ensureServiceOccurrences,
  listServiceAttendance,
  listServicesWithState,
} from "@/lib/data/checkin";
import {
  addDaysToDateKey,
  churchDateKey,
  formatChurchDate,
  formatChurchTime,
} from "@/lib/datetime";
import { checkinStateLabels } from "@/lib/labels";
import { checkinStateTone } from "@/lib/status-tones";
import { cn } from "@/lib/utils";
import type { AppRole, ServiceWithState } from "@/types/database";
import { AttendanceConsole } from "./attendance-console";
import {
  correctionAddAction,
  recordAttendanceAction,
  refreshAttendanceAction,
  scanAttendanceAction,
  searchPeopleForCheckinAction,
  setCheckinStateAction,
  voidAttendanceAction,
} from "./actions";

/** Mismo criterio que /visitantes/nuevo (alta con detección de duplicados). */
const PEOPLE_WRITE: AppRole[] = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "seguimiento",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ culto?: string }>;
}) {
  const { culto } = await searchParams;
  const user = await getCurrentUser();
  if (!hasAnyRole(user, ATTENDANCE_AREA_ROLES)) redirect("/dashboard");
  const caps = attendanceCapabilities(user);

  // Respaldo del trabajo programado: si faltara alguna fecha, se crea ya.
  await ensureServiceOccurrences();

  const today = churchDateKey();
  const all = await listServicesWithState({
    from: addDaysToDateKey(today, -7),
    to: addDaysToDateKey(today, 14),
  });

  // Hoy + cualquiera que siga abierto (p. ej. uno de ayer sin cerrar).
  const candidates = all.filter(
    (s) => s.service_date === today || (s.checkin_state === "abierto" && s.service_date < today),
  );
  const next = all.find((s) => s.service_date > today && s.status === "programado");

  const requested = culto && UUID_RE.test(culto) ? all.find((s) => s.id === culto) : undefined;
  const selected: ServiceWithState | undefined =
    requested ?? (candidates.length === 1 ? candidates[0] : undefined);

  const entries =
    selected && (caps.record || caps.correct)
      ? await listServiceAttendance(selected.id, caps.correct)
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistencia"
        description="Confirma la asistencia de quienes llegan: búscalos por nombre o escanea su QR personal."
        actions={
          caps.manage ? (
            <Button asChild variant="outline">
              <Link href="/check-in/programacion">
                <CalendarClock className="size-4" aria-hidden />
                Programación de cultos
              </Link>
            </Button>
          ) : null
        }
      />

      {candidates.length > 1 || (requested && !candidates.some((c) => c.id === requested.id)) ? (
        <nav aria-label="Elegir culto" className="space-y-2">
          <p className="text-sm font-medium">
            {selected ? "Culto seleccionado" : "Hay varios cultos: elige en cuál vas a registrar"}
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              ...candidates,
              ...(requested && !candidates.includes(requested) ? [requested] : []),
            ].map((s) => (
              <li key={s.id}>
                <Link
                  href={`/check-in?culto=${s.id}`}
                  aria-current={selected?.id === s.id ? "page" : undefined}
                  className={cn(
                    "bg-card ring-foreground/10 hover:ring-foreground/25 flex items-center justify-between gap-3 rounded-xl p-3 ring-1 transition-shadow",
                    selected?.id === s.id && "ring-primary hover:ring-primary ring-2",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-muted-foreground block text-sm">
                      {formatChurchDate(s.starts_at)} · {formatChurchTime(s.starts_at)}
                    </span>
                  </span>
                  <StatusBadge tone={checkinStateTone[s.checkin_state]}>
                    {checkinStateLabels[s.checkin_state]}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {selected ? (
        <AttendanceConsole
          key={selected.id}
          initialService={selected}
          initialEntries={entries}
          caps={caps}
          canRegisterPeople={hasAnyRole(user, PEOPLE_WRITE)}
          actions={{
            search: searchPeopleForCheckinAction,
            record: recordAttendanceAction,
            scan: scanAttendanceAction,
            refresh: refreshAttendanceAction,
            setState: setCheckinStateAction,
            voidEntry: voidAttendanceAction,
            correctionAdd: correctionAddAction,
          }}
        />
      ) : candidates.length === 0 ? (
        <div className="bg-card ring-foreground/10 rounded-xl shadow-xs ring-1">
          <EmptyState
            icon={CalendarDays}
            title="Hoy no hay cultos programados"
            description={
              next
                ? `Próximo: ${next.name}, ${formatChurchDate(next.starts_at)} a las ${formatChurchTime(next.starts_at)}.`
                : "No hay cultos en los próximos días."
            }
            action={
              caps.manage ? (
                <Button asChild variant="outline">
                  <Link href="/check-in/programacion">
                    Ver programación
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              ) : null
            }
          />
        </div>
      ) : null}
    </div>
  );
}
