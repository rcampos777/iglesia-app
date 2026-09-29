"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  LockOpen,
  QrCode,
  RotateCw,
  ScanLine,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import type { AttendanceCapabilities } from "@/lib/auth/attendance";
import { checkinMethodLabels, checkinStateLabels, membershipStatusLabels } from "@/lib/labels";
import { checkinStateTone } from "@/lib/status-tones";
import { formatChurchDate, formatChurchTime } from "@/lib/datetime";
import type {
  CheckinSearchResult,
  RecordAttendanceResult,
  ServiceAttendanceEntry,
  ServiceWithState,
} from "@/types/database";
import { QrCameraScanner } from "./qr-camera-scanner";

export type AttendanceActions = {
  search: (serviceId: string, q: string) => Promise<ActionResult<CheckinSearchResult[]>>;
  record: (serviceId: string, personId: string) => Promise<ActionResult<RecordAttendanceResult>>;
  scan: (serviceId: string, token: string) => Promise<ActionResult<RecordAttendanceResult>>;
  refresh: (
    serviceId: string,
  ) => Promise<
    ActionResult<{ service: ServiceWithState | null; entries: ServiceAttendanceEntry[] }>
  >;
  setState: (serviceId: string, state: "abierto" | "cerrado") => Promise<ActionResult>;
  voidEntry: (checkinId: string, reason: string) => Promise<ActionResult>;
  correctionAdd: (
    serviceId: string,
    personId: string,
    reason: string,
  ) => Promise<ActionResult<RecordAttendanceResult>>;
};

type Feedback =
  { kind: "ok" | "already"; text: string } | { kind: "error"; text: string; retry?: () => void };

type Correction =
  { type: "void"; entry: ServiceAttendanceEntry } | { type: "add"; person: CheckinSearchResult };

/** Un "ya registrado" propio de hace segundos = un reintento tras un corte de red. */
function isRecent(iso: string | undefined): boolean {
  return !!iso && Date.now() - new Date(iso).getTime() < 120000;
}

const NETWORK_ERROR =
  "No hubo respuesta del servidor (revisa la conexión). Esta persona todavía NO aparece como registrada. Toca «Reintentar»: no se duplicará.";

export function AttendanceConsole({
  initialService,
  initialEntries,
  caps,
  canRegisterPeople,
  actions,
}: {
  initialService: ServiceWithState;
  initialEntries: ServiceAttendanceEntry[];
  caps: AttendanceCapabilities;
  canRegisterPeople: boolean;
  actions: AttendanceActions;
}) {
  const [service, setService] = useState(initialService);
  const [entries, setEntries] = useState(initialEntries);
  const [mode, setMode] = useState<"buscar" | "qr">("buscar");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CheckinSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [stateBusy, setStateBusy] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const searchSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerInputRef = useRef<HTMLInputElement>(null);

  const serviceId = service.id;
  const isOpen = service.checkin_state === "abierto";
  const canAct = caps.record && isOpen;
  const active = entries.filter((e) => !e.voided_at);

  const refresh = useCallback(async () => {
    try {
      const res = await actions.refresh(serviceId);
      if (res.ok) {
        if (res.data.service) setService(res.data.service);
        setEntries(res.data.entries);
      } else {
        setFeedback({ kind: "error", text: res.error });
      }
    } catch {
      // Sin conexión: el próximo intento lo vuelve a pedir.
    }
  }, [actions, serviceId]);

  // Lista compartida entre varios ujieres + cierres automáticos.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20000);
    return () => window.clearInterval(id);
  }, [refresh]);

  function changeQuery(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      searchSeq.current++;
      setResults([]);
      setSearchError(null);
      setSearching(false);
    } else {
      setSearching(true);
    }
  }

  // Búsqueda en el servidor (nunca se descarga el directorio).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    const t = window.setTimeout(async () => {
      try {
        const res = await actions.search(serviceId, q);
        if (seq !== searchSeq.current) return;
        if (res.ok) {
          setResults(res.data);
          setSearchError(null);
        } else {
          setResults([]);
          setSearchError(res.error);
        }
      } catch {
        if (seq === searchSeq.current) setSearchError("No se pudo buscar. Revisa la conexión.");
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, actions, serviceId]);

  function showResult(res: RecordAttendanceResult) {
    if (res.result === "registrado" || (res.by_me && isRecent(res.checked_in_at))) {
      setFeedback({ kind: "ok", text: `${res.person_name} quedó registrado.` });
    } else {
      setFeedback({ kind: "already", text: `${res.person_name} ya estaba registrado.` });
    }
  }

  async function runRecord(
    op: () => Promise<ActionResult<RecordAttendanceResult>>,
    busyKey: string,
    after?: () => void,
  ) {
    setFeedback(null);
    if (busyKey === "scan") setScanBusy(true);
    else setBusyId(busyKey);
    try {
      const res = await op();
      if (res.ok) {
        showResult(res.data);
        after?.();
        void refresh();
      } else {
        setFeedback({ kind: "error", text: res.error });
      }
    } catch {
      setFeedback({
        kind: "error",
        text: NETWORK_ERROR,
        retry: () => void runRecord(op, busyKey, after),
      });
    } finally {
      if (busyKey === "scan") setScanBusy(false);
      else setBusyId(null);
    }
  }

  function confirmPerson(p: CheckinSearchResult) {
    void runRecord(
      () => actions.record(serviceId, p.person_id),
      p.person_id,
      () => {
        changeQuery("");
        inputRef.current?.focus();
      },
    );
  }

  function handleScan(token: string) {
    if (!canAct || scanBusy) return;
    void runRecord(() => actions.scan(serviceId, token), "scan");
  }

  async function changeState(state: "abierto" | "cerrado") {
    setStateBusy(true);
    setFeedback(null);
    try {
      const res = await actions.setState(serviceId, state);
      if (!res.ok) setFeedback({ kind: "error", text: res.error });
      await refresh();
    } catch {
      setFeedback({ kind: "error", text: "No hubo respuesta del servidor. Intenta de nuevo." });
    } finally {
      setStateBusy(false);
    }
  }

  const start = new Date(service.starts_at);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-6">
      <div className="space-y-4 lg:col-span-3">
        {/* Culto seleccionado */}
        <section
          aria-labelledby="culto-actual"
          className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="culto-actual" className="text-lg font-semibold">
                {service.name}
              </h2>
              <p className="text-muted-foreground text-[15px]">
                {formatChurchDate(start)} · {formatChurchTime(start)}
                {service.location ? ` · ${service.location}` : ""}
              </p>
            </div>
            <StatusBadge tone={checkinStateTone[service.checkin_state]}>
              {checkinStateLabels[service.checkin_state]}
            </StatusBadge>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            {service.checkin_state === "pendiente"
              ? `El registro abre a las ${formatChurchTime(service.checkin_opens_at)}.`
              : service.checkin_state === "cancelado"
                ? `Este culto fue cancelado${service.cancel_reason ? `: ${service.cancel_reason}` : "."}`
                : service.checkin_closes_at && service.checkin_manual_state === null
                  ? `Cierre automático: ${formatChurchTime(service.checkin_closes_at)}.`
                  : service.checkin_state === "abierto"
                    ? "Sin cierre automático: se cierra manualmente."
                    : null}
          </p>
          {caps.control && service.checkin_state !== "cancelado" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {isOpen ? (
                <Button
                  variant="outline"
                  onClick={() => void changeState("cerrado")}
                  disabled={stateBusy}
                >
                  <Lock className="size-4" aria-hidden />
                  Cerrar registro
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => void changeState("abierto")}
                  disabled={stateBusy}
                >
                  <LockOpen className="size-4" aria-hidden />
                  Abrir registro
                </Button>
              )}
            </div>
          ) : null}
        </section>

        {/* Respuesta del último intento */}
        <div aria-live="polite" aria-atomic="true">
          {feedback ? (
            <div
              role={feedback.kind === "error" ? "alert" : "status"}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-[15px]",
                feedback.kind === "ok" && "border-state-active/40 bg-state-active/10",
                feedback.kind === "already" && "border-state-tracking/40 bg-state-tracking/10",
                feedback.kind === "error" && "border-destructive/40 bg-destructive/10",
              )}
            >
              {feedback.kind === "ok" ? (
                <CheckCircle2 className="text-state-active mt-0.5 size-5 shrink-0" aria-hidden />
              ) : feedback.kind === "already" ? (
                <Check className="text-state-tracking mt-0.5 size-5 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-medium">{feedback.text}</p>
                {feedback.kind === "error" && feedback.retry ? (
                  <Button size="sm" onClick={feedback.retry}>
                    <RotateCw className="size-4" aria-hidden />
                    Reintentar
                  </Button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-muted-foreground hover:text-foreground rounded p-1"
                aria-label="Cerrar aviso"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>

        {/* Registro */}
        {caps.record || caps.correct ? (
          <section
            aria-label="Registrar asistencia"
            className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 shadow-xs ring-1 sm:p-5"
          >
            {!isOpen ? (
              <p className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
                {service.checkin_state === "cancelado"
                  ? "Un culto cancelado no acepta registros."
                  : caps.correct
                    ? "El registro no está abierto. Puedes agregar asistencias como corrección (con motivo)."
                    : "El registro no está abierto. Pide a quien controla el check-in que lo abra."}
              </p>
            ) : null}

            {caps.record ? (
              <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1" role="tablist">
                {(
                  [
                    ["buscar", "Buscar", Search],
                    ["qr", "Escanear QR", QrCode],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    onClick={() => setMode(value)}
                    className={cn(
                      "flex h-11 items-center justify-center gap-2 rounded-md text-[15px] font-medium transition-colors",
                      mode === value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {mode === "buscar" || !caps.record ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="checkin-q">Nombre de la persona</Label>
                  <div className="relative">
                    <Search
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      ref={inputRef}
                      id="checkin-q"
                      type="search"
                      autoComplete="off"
                      enterKeyHint="search"
                      placeholder="Escribe al menos 2 letras"
                      value={query}
                      onChange={(e) => changeQuery(e.target.value)}
                      disabled={service.checkin_state === "cancelado"}
                      className="h-12! pl-10 text-base"
                    />
                    {searching ? (
                      <Loader2
                        className="text-muted-foreground absolute top-1/2 right-3 size-5 -translate-y-1/2 animate-spin"
                        aria-label="Buscando"
                      />
                    ) : null}
                  </div>
                </div>

                {searchError ? (
                  <p className="text-destructive text-sm" role="alert">
                    {searchError}
                  </p>
                ) : null}

                {results.length > 0 ? (
                  <ul className="divide-y rounded-lg border" aria-label="Resultados">
                    {results.map((p) => {
                      const already =
                        p.already_checked_in || active.some((e) => e.person_id === p.person_id);
                      return (
                        <li
                          key={p.person_id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-medium">{p.display_name}</p>
                            <p className="text-muted-foreground truncate text-sm">
                              {p.hint ?? membershipStatusLabels[p.membership_status]}
                            </p>
                          </div>
                          {already ? (
                            <StatusBadge tone="active">Ya registrado</StatusBadge>
                          ) : canAct ? (
                            <Button
                              className="h-11! shrink-0 px-4"
                              onClick={() => confirmPerson(p)}
                              disabled={busyId !== null}
                              aria-label={`Confirmar asistencia de ${p.display_name}`}
                            >
                              {busyId === p.person_id ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                              ) : (
                                <Check className="size-4" aria-hidden />
                              )}
                              Confirmar
                            </Button>
                          ) : caps.correct && service.checkin_state !== "cancelado" ? (
                            <Button
                              variant="outline"
                              className="h-11! shrink-0"
                              onClick={() => setCorrection({ type: "add", person: p })}
                            >
                              Agregar (corrección)
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                {query.trim().length >= 2 && !searching && !searchError ? (
                  <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                    {results.length === 0 ? (
                      <p className="text-foreground mb-1 font-medium">
                        No encontramos a nadie así.
                      </p>
                    ) : (
                      <p className="mb-1">¿No es ninguna de estas personas?</p>
                    )}
                    {canRegisterPeople ? (
                      <p>
                        Si es un visitante nuevo,{" "}
                        <Link
                          href="/visitantes/nuevo"
                          className="text-foreground inline-flex items-center gap-1 font-medium underline"
                        >
                          <UserPlus className="size-4" aria-hidden />
                          regístralo aquí
                        </Link>{" "}
                        (revisa duplicados) y luego búscalo de nuevo.
                      </p>
                    ) : (
                      <p>
                        Si es un visitante nuevo, pide a alguien de Seguimiento o a un administrador
                        que lo registre; luego búscalo de nuevo aquí.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                {canAct ? <QrCameraScanner onDetected={handleScan} paused={scanBusy} /> : null}
                <form
                  className="space-y-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = scannerInputRef.current?.value.trim();
                    if (v) handleScan(v);
                    if (scannerInputRef.current) scannerInputRef.current.value = "";
                  }}
                >
                  <Label htmlFor="checkin-reader" className="text-muted-foreground text-sm">
                    <ScanLine className="size-4" aria-hidden />
                    Lector USB o Bluetooth: toca aquí y escanea
                  </Label>
                  <Input
                    ref={scannerInputRef}
                    id="checkin-reader"
                    autoComplete="off"
                    placeholder="Código del QR"
                    disabled={!canAct || scanBusy}
                    className="h-11!"
                  />
                </form>
                {scanBusy ? (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Confirmando…
                  </p>
                ) : null}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {/* Registrados */}
      <section
        aria-labelledby="registrados"
        className="bg-card ring-foreground/10 h-fit rounded-xl shadow-xs ring-1 lg:col-span-2"
      >
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 id="registrados" className="flex items-center gap-2 text-base font-semibold">
            <Users className="text-muted-foreground size-[18px]" aria-hidden />
            Registrados
            <span className="text-muted-foreground font-normal tabular-nums">
              ({active.length})
            </span>
          </h2>
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            <RotateCw className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            Todavía no hay nadie registrado en este culto.
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto">
            {entries.map((e) => (
              <li key={e.checkin_id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className={cn("min-w-0", e.voided_at && "opacity-60")}>
                  <p className={cn("truncate text-[15px]", e.voided_at && "line-through")}>
                    {e.display_name}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatChurchTime(e.checked_in_at)} · {checkinMethodLabels[e.method]}
                    {e.is_correction ? " · corrección" : ""}
                    {e.recorded_by_name ? ` · ${e.recorded_by_name}` : ""}
                  </p>
                  {e.voided_at ? (
                    <p className="text-muted-foreground text-sm">Anulado: {e.void_reason}</p>
                  ) : e.correction_reason ? (
                    <p className="text-muted-foreground text-sm">Motivo: {e.correction_reason}</p>
                  ) : null}
                </div>
                {caps.correct && !e.voided_at ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive shrink-0"
                    onClick={() => setCorrection({ type: "void", entry: e })}
                  >
                    Anular
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <CorrectionDialog
        correction={correction}
        onClose={() => setCorrection(null)}
        onSubmit={async (reason) => {
          if (!correction) return { ok: true, data: undefined };
          if (correction.type === "void") {
            const res = await actions.voidEntry(correction.entry.checkin_id, reason);
            if (res.ok) {
              setFeedback({
                kind: "ok",
                text: `Se anuló la asistencia de ${correction.entry.display_name}.`,
              });
              void refresh();
            }
            return res;
          }
          const res = await actions.correctionAdd(serviceId, correction.person.person_id, reason);
          if (res.ok) {
            showResult(res.data);
            changeQuery("");
            void refresh();
          }
          return res.ok ? { ok: true, data: undefined } : res;
        }}
      />
    </div>
  );
}

function CorrectionDialog({
  correction,
  onClose,
  onSubmit,
}: {
  correction: Correction | null;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<ActionResult>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const name =
    correction?.type === "void" ? correction.entry.display_name : correction?.person.display_name;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit(reason);
      if (res.ok) {
        setReason("");
        onClose();
      } else {
        setError(res.error);
      }
    } catch {
      setError("No hubo respuesta del servidor. No se aplicó el cambio; intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={correction !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {correction?.type === "void"
                ? "Anular asistencia"
                : "Agregar asistencia (corrección)"}
            </DialogTitle>
            <DialogDescription>
              {correction?.type === "void"
                ? `El registro de ${name} dejará de contar. No se borra: queda en el historial con tu nombre y el motivo.`
                : `Se registrará a ${name} fuera de la ventana normal. Queda auditado con tu nombre y el motivo.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="correction-reason">Motivo</Label>
            <Textarea
              id="correction-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                correction?.type === "void"
                  ? "Ej.: se marcó a la persona equivocada"
                  : "Ej.: llegó después del cierre"
              }
              minLength={5}
              maxLength={300}
              required
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={correction?.type === "void" ? "destructive" : "default"}
              disabled={busy || reason.trim().length < 5}
            >
              {busy ? "Guardando…" : correction?.type === "void" ? "Anular" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
