import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarPlus, Repeat, Settings2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { MANAGE_SERVICES_ROLES } from "@/lib/auth/attendance";
import {
  ensureServiceOccurrences,
  getScheduleSettings,
  listSeriesWithRules,
  listServicesWithState,
} from "@/lib/data/checkin";
import {
  addDaysToDateKey,
  churchDateKey,
  formatChurchShortDate,
  formatChurchTime,
  formatDateKeyInline,
  formatLocalTime,
} from "@/lib/datetime";
import { serviceTypeLabels, weekdayLabels } from "@/lib/labels";
import type { ServiceSeriesRuleRow } from "@/types/database";
import { HorizonForm, OccurrenceActions, SeriesEditor, SpecialServiceForm } from "./schedule-forms";

function Panel({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="text-muted-foreground size-[18px]" aria-hidden />
        {title}
      </h2>
      {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ruleSummary(r: ServiceSeriesRuleRow): string {
  const close =
    r.checkin_closes_minutes_after === null
      ? "cierre manual"
      : `cierra ${r.checkin_closes_minutes_after} min después`;
  return `${weekdayLabels[r.weekday]} · ${formatLocalTime(r.local_time)} · abre ${r.checkin_opens_minutes_before} min antes · ${close}`;
}

export default async function SchedulePage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, MANAGE_SERVICES_ROLES)) redirect("/check-in");

  await ensureServiceOccurrences();
  const today = churchDateKey();
  const [series, settings] = await Promise.all([listSeriesWithRules(), getScheduleSettings()]);
  const weeks = settings?.horizon_weeks ?? 4;
  const upcoming = await listServicesWithState({
    from: today,
    to: addDaysToDateKey(today, weeks * 7),
  });

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/check-in">
          <ArrowLeft className="size-4" aria-hidden />
          Asistencia
        </Link>
      </Button>
      <PageHeader
        title="Programación de cultos"
        description="Los cultos semanales se crean solos. Aquí cambias horarios, cancelas o mueves una fecha y creas cultos especiales. Todas las horas son de Puerto Rico."
      />

      <Panel
        icon={Repeat}
        title="Cultos semanales"
        description="Un cambio aplica desde la fecha que elijas; lo anterior y su asistencia se conservan."
      >
        <ul className="divide-y">
          {series.map(({ series: s, current, upcoming: next }) => {
            const base = next ?? current;
            const minFrom = base
              ? [today, addDaysToDateKey(base.effective_from, 1)].sort().at(-1)!
              : today;
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  {current ? (
                    <p className="text-muted-foreground text-sm">{ruleSummary(current)}</p>
                  ) : (
                    <p className="text-muted-foreground text-sm">Sin horario vigente hoy.</p>
                  )}
                  {next ? (
                    <p className="text-sm">
                      Cambio programado desde el {formatDateKeyInline(next.effective_from)}:{" "}
                      {ruleSummary(next)}
                    </p>
                  ) : current?.effective_until ? (
                    <p className="text-sm">
                      Termina el {formatDateKeyInline(current.effective_until)}.
                    </p>
                  ) : null}
                </div>
                {base ? (
                  <SeriesEditor
                    seriesId={s.id}
                    rule={base}
                    minFrom={minFrom}
                    defaultFrom={minFrom}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        icon={Settings2}
        title={`Próximos cultos (${weeks} semanas)`}
        description="Cancelar o mover una fecha solo afecta esa fecha; la programación automática no la deshace."
      >
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay cultos en este período.</p>
        ) : (
          <ul className="divide-y">
            {upcoming.map((svc) => (
              <li
                key={svc.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {formatChurchShortDate(svc.starts_at)} · {formatChurchTime(svc.starts_at)}
                  </p>
                  <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {svc.name} · {serviceTypeLabels[svc.service_type]}
                    {svc.status === "cancelado" ? (
                      <StatusBadge tone="error">Cancelado</StatusBadge>
                    ) : svc.is_exception ? (
                      <StatusBadge tone="tracking">
                        {svc.series_id ? "Cambiado a mano" : "Especial"}
                      </StatusBadge>
                    ) : null}
                  </p>
                  {svc.cancel_reason ? (
                    <p className="text-muted-foreground text-sm">Motivo: {svc.cancel_reason}</p>
                  ) : null}
                </div>
                <OccurrenceActions
                  serviceId={svc.id}
                  name={svc.name}
                  dateKey={svc.service_date}
                  time={(svc.start_time ?? "00:00").slice(0, 5)}
                  cancelled={svc.status === "cancelado"}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="lg:col-span-2">
          <Panel icon={CalendarPlus} title="Culto especial">
            <SpecialServiceForm today={today} />
          </Panel>
        </div>
        <Panel icon={Settings2} title="Anticipación">
          <HorizonForm weeks={weeks} />
        </Panel>
      </div>
    </div>
  );
}
