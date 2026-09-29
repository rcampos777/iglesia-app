"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { serviceTypeLabels, weekdayLabels } from "@/lib/labels";
import { formatDateKeyInline as inlineDate, formatLocalTime } from "@/lib/datetime";
import type { ActionResult } from "@/lib/action-result";
import type { ServiceSeriesRuleRow, ServiceType } from "@/types/database";
import {
  cancelServiceAction,
  createSpecialServiceAction,
  reinstateServiceAction,
  rescheduleServiceAction,
  updateHorizonAction,
  updateSeriesAction,
} from "./actions";

const SERVICE_TYPES = Object.keys(serviceTypeLabels) as ServiceType[];

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="text-destructive text-sm" role="alert">
      {error}
    </p>
  ) : null;
}

function useSubmit() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run<T>(op: () => Promise<ActionResult<T>>, onOk: (data: T) => void) {
    setError(null);
    start(async () => {
      try {
        const res = await op();
        if (res.ok) onOk(res.data);
        else setError(res.error);
      } catch {
        setError("No hubo respuesta del servidor. No se guardó; intenta de nuevo.");
      }
    });
  }
  return { pending, error, setError, run };
}

export function HorizonForm({ weeks }: { weeks: number }) {
  const [value, setValue] = useState(String(weeks));
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useSubmit();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(
          () => updateHorizonAction(value),
          () => setSaved(true),
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="horizon">Generar cultos con anticipación de</Label>
        <div className="flex items-center gap-2">
          <Input
            id="horizon"
            type="number"
            min={1}
            max={26}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-20"
          />
          <span className="text-sm">semanas</span>
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={pending || value === String(weeks)}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      {saved ? <p className="text-state-active w-full text-sm">Guardado.</p> : null}
      <div className="w-full">
        <ErrorText error={error} />
      </div>
    </form>
  );
}

export function SeriesEditor({
  seriesId,
  rule,
  minFrom,
  defaultFrom,
}: {
  seriesId: string;
  rule: ServiceSeriesRuleRow;
  /** Primer día permitido (hoy, o el día siguiente al inicio del horario vigente). */
  minFrom: string;
  defaultFrom: string;
}) {
  const [open, setOpen] = useState(false);
  const [endSeries, setEndSeries] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [name, setName] = useState(rule.name);
  const [type, setType] = useState<ServiceType>(rule.service_type);
  const [weekday, setWeekday] = useState(String(rule.weekday));
  const [time, setTime] = useState(rule.local_time.slice(0, 5));
  const [location, setLocation] = useState(rule.location ?? "");
  const [opensBefore, setOpensBefore] = useState(String(rule.checkin_opens_minutes_before));
  const [closesAfter, setClosesAfter] = useState(
    rule.checkin_closes_minutes_after === null ? "" : String(rule.checkin_closes_minutes_after),
  );
  const [summary, setSummary] = useState<string | null>(null);
  const { pending, error, setError, run } = useSubmit();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(
      () =>
        updateSeriesAction(
          endSeries
            ? { endSeries: true, seriesId, effectiveFrom: from }
            : {
                endSeries: false,
                seriesId,
                effectiveFrom: from,
                name,
                serviceType: type,
                weekday,
                time,
                location,
                opensBefore,
                closesAfter,
              },
        ),
      (r) => {
        setSummary(
          `Aplicado desde el ${inlineDate(from)}. Fechas regeneradas: ${r.created}. Conservadas (con asistencia o cambiadas a mano): ${r.kept}.`,
        );
        setOpen(false);
      },
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) setError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="size-4" aria-hidden />
            Cambiar horario
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Cambiar «{rule.name}»</DialogTitle>
              <DialogDescription>
                Los cultos anteriores a la fecha elegida y su asistencia no cambian.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor={`from-${seriesId}`}>Aplicar a partir de</Label>
              <Input
                id={`from-${seriesId}`}
                type="date"
                min={minFrom}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={endSeries} onCheckedChange={(v) => setEndSeries(v === true)} />
              Terminar esta serie (no programar más fechas)
            </label>

            {!endSeries ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`name-${seriesId}`}>Nombre</Label>
                  <Input
                    id={`name-${seriesId}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`weekday-${seriesId}`}>Día</Label>
                  <Select value={weekday} onValueChange={setWeekday}>
                    <SelectTrigger id={`weekday-${seriesId}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {weekdayLabels.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`time-${seriesId}`}>Hora (Puerto Rico)</Label>
                  <Input
                    id={`time-${seriesId}`}
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`type-${seriesId}`}>Tipo</Label>
                  <Select value={type} onValueChange={(v) => setType(v as ServiceType)}>
                    <SelectTrigger id={`type-${seriesId}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {serviceTypeLabels[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`loc-${seriesId}`}>Lugar (opcional)</Label>
                  <Input
                    id={`loc-${seriesId}`}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`open-${seriesId}`}>Abrir registro (min antes)</Label>
                  <Input
                    id={`open-${seriesId}`}
                    type="number"
                    min={0}
                    max={1440}
                    value={opensBefore}
                    onChange={(e) => setOpensBefore(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`close-${seriesId}`}>Cerrar registro (min después)</Label>
                  <Input
                    id={`close-${seriesId}`}
                    type="number"
                    min={1}
                    max={1440}
                    placeholder="Vacío = cierre manual"
                    value={closesAfter}
                    onChange={(e) => setClosesAfter(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <Alert>
              <AlertDescription>
                {from ? (
                  <>
                    <p className="font-medium">
                      {endSeries
                        ? `Desde el ${inlineDate(from)} no se programarán más fechas de esta serie.`
                        : `Desde el ${inlineDate(from)}: ${weekdayLabels[Number(weekday)]} a las ${formatLocalTime(time)}.`}
                    </p>
                    <p>
                      Antes de esa fecha nada cambia. Las fechas desde ese día que ya tengan
                      asistencia o un cambio manual se conservan tal cual.
                    </p>
                  </>
                ) : (
                  "Elige desde qué fecha aplica el cambio."
                )}
              </AlertDescription>
            </Alert>

            <ErrorText error={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending || !from}>
                {pending ? "Aplicando…" : endSeries ? "Terminar serie" : "Aplicar cambio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {summary ? (
        <p className="text-state-active basis-full text-sm" role="status">
          {summary}
        </p>
      ) : null}
    </>
  );
}

export function OccurrenceActions({
  serviceId,
  name,
  dateKey,
  time,
  cancelled,
}: {
  serviceId: string;
  name: string;
  dateKey: string;
  time: string;
  cancelled: boolean;
}) {
  const [dialog, setDialog] = useState<"cancel" | "move" | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(dateKey);
  const [newTime, setNewTime] = useState(time);
  const { pending, error, setError, run } = useSubmit();

  if (cancelled) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => reinstateServiceAction(serviceId),
              () => undefined,
            )
          }
        >
          Reactivar
        </Button>
        <ErrorText error={error} />
      </div>
    );
  }

  return (
    <>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" onClick={() => (setError(null), setDialog("move"))}>
          Cambiar hora
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => (setError(null), setDialog("cancel"))}
        >
          Cancelar
        </Button>
      </div>
      <Dialog open={dialog !== null} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  dialog === "cancel"
                    ? cancelServiceAction(serviceId, reason)
                    : rescheduleServiceAction({ serviceId, date, time: newTime, reason }),
                () => {
                  setDialog(null);
                  setReason("");
                },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {dialog === "cancel" ? `Cancelar ${name}` : `Cambiar fecha u hora de ${name}`}
              </DialogTitle>
              <DialogDescription>
                {dialog === "cancel"
                  ? `Solo el del ${inlineDate(dateKey)}. La serie sigue igual y esta fecha no se vuelve a crear.`
                  : "Solo esta fecha. La serie no cambia y la programación automática no deshará este ajuste."}
              </DialogDescription>
            </DialogHeader>
            {dialog === "move" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`d-${serviceId}`}>Fecha</Label>
                  <Input
                    id={`d-${serviceId}`}
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`t-${serviceId}`}>Hora (PR)</Label>
                  <Input
                    id={`t-${serviceId}`}
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`r-${serviceId}`}>Motivo (opcional)</Label>
              <Input
                id={`r-${serviceId}`}
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <ErrorText error={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                Volver
              </Button>
              <Button
                type="submit"
                variant={dialog === "cancel" ? "destructive" : "default"}
                disabled={pending}
              >
                {pending ? "Guardando…" : dialog === "cancel" ? "Cancelar culto" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SpecialServiceForm({ today }: { today: string }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ServiceType>("culto_general");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("19:30");
  const [location, setLocation] = useState("");
  const [closesAfter, setClosesAfter] = useState("");
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useSubmit();

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(
          () =>
            createSpecialServiceAction({
              name,
              serviceType: type,
              date,
              time,
              location,
              closesAfter,
            }),
          () => {
            setSaved(true);
            setName("");
          },
        );
      }}
    >
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="sp-name">Nombre</Label>
        <Input
          id="sp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej.: Culto de aniversario"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sp-date">Fecha</Label>
        <Input
          id="sp-date"
          type="date"
          min={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sp-time">Hora (Puerto Rico)</Label>
        <Input
          id="sp-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sp-type">Tipo</Label>
        <Select value={type} onValueChange={(v) => setType(v as ServiceType)}>
          <SelectTrigger id="sp-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SERVICE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {serviceTypeLabels[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sp-loc">Lugar (opcional)</Label>
        <Input id="sp-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="sp-close">Cerrar registro (minutos después del inicio)</Label>
        <Input
          id="sp-close"
          type="number"
          min={1}
          max={1440}
          placeholder="Vacío = cierre manual"
          value={closesAfter}
          onChange={(e) => setClosesAfter(e.target.value)}
          className="sm:w-60"
        />
        <p className="text-muted-foreground text-sm">El registro abre una hora antes del inicio.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          <CalendarPlus className="size-4" aria-hidden />
          {pending ? "Creando…" : "Crear culto especial"}
        </Button>
        {saved ? <p className="text-state-active text-sm">Culto creado.</p> : null}
      </div>
      <div className="sm:col-span-2">
        <ErrorText error={error} />
      </div>
    </form>
  );
}
