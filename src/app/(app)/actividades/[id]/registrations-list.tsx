"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/lib/money";
import { churchDateKey, formatChurchShortDate } from "@/lib/datetime";
import type { ActionResult } from "@/lib/action-result";
import type { RegistrationWithDetails } from "@/lib/data/registrations";
import type { RegistrationPaymentMethod } from "@/types/database";
import {
  addRegistrationPaymentAction,
  cancelRegistrationAction,
  deleteRegistrationPaymentAction,
  linkRegistrationAction,
  resendConfirmationAction,
} from "./registration-actions";

const methodLabels: Record<RegistrationPaymentMethod, string> = {
  ath_movil: "ATH Móvil",
  efectivo: "Efectivo",
  cheque: "Cheque",
  otro: "Otro",
};

export function RegistrationsList({
  activityId,
  priceCents,
  depositCents,
  registrations,
}: {
  activityId: string;
  priceCents: number | null;
  depositCents: number | null;
  registrations: RegistrationWithDetails[];
}) {
  const [showCancelled, setShowCancelled] = useState(false);
  const active = registrations.filter((r) => !r.cancelled_at);
  const cancelled = registrations.filter((r) => r.cancelled_at);
  const review = active.filter((r) => r.match_status === "posible_duplicado").length;
  const paid = active.reduce((sum, r) => sum + r.amount_paid_cents, 0);
  const reserved = depositCents
    ? active.filter((r) => r.amount_paid_cents >= depositCents).length
    : null;

  if (registrations.length === 0) {
    return <p className="text-muted-foreground text-sm">Todavía nadie se ha inscrito en línea.</p>;
  }

  const shown = showCancelled ? registrations : active;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Inscritos" value={String(active.length)} />
        {reserved != null ? <Stat label="Con depósito" value={String(reserved)} /> : null}
        <Stat label="Recaudado" value={formatCents(paid)} />
        {priceCents ? (
          <Stat
            label="Por cobrar"
            value={formatCents(
              active.reduce((s, r) => s + Math.max(0, priceCents - r.amount_paid_cents), 0),
            )}
          />
        ) : null}
      </dl>

      {review > 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {review === 1
            ? "1 inscripción parece ser de alguien que ya está en Personas."
            : `${review} inscripciones parecen ser de personas que ya están en Personas.`}{" "}
          Ábrelas para confirmar.
        </p>
      ) : null}

      <div className="divide-y rounded-md border">
        {shown.map((r) => (
          <RegistrationRow
            key={r.id}
            activityId={activityId}
            priceCents={priceCents}
            depositCents={depositCents}
            reg={r}
          />
        ))}
      </div>

      {cancelled.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => setShowCancelled((v) => !v)}>
          {showCancelled ? "Ocultar canceladas" : `Ver canceladas (${cancelled.length})`}
        </Button>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-md p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function RegistrationRow({
  activityId,
  priceCents,
  depositCents,
  reg,
}: {
  activityId: string;
  priceCents: number | null;
  depositCents: number | null;
  reg: RegistrationWithDetails;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const balance = priceCents ? Math.max(0, priceCents - reg.amount_paid_cents) : 0;
  const payTone =
    priceCents && balance === 0
      ? { tone: "active" as const, text: "Pagado" }
      : depositCents && reg.amount_paid_cents >= depositCents
        ? { tone: "tracking" as const, text: "Reservado" }
        : { tone: "warning" as const, text: "Sin depósito" };

  function run(fn: () => Promise<ActionResult>, okText?: string) {
    startTransition(async () => {
      const res = await fn();
      setMessage(
        res.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: res.error },
      );
    });
  }

  return (
    <details className="group p-3">
      <summary className="flex cursor-pointer list-none flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">
            {reg.first_name} {reg.last_name}
            {reg.has_medical_condition ? (
              <span className="text-muted-foreground ml-2 text-xs">· condición médica</span>
            ) : null}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {reg.phone} · {reg.email}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reg.cancelled_at ? (
            <StatusBadge tone="neutral">Cancelada</StatusBadge>
          ) : (
            <>
              {reg.match_status === "posible_duplicado" ? (
                <StatusBadge tone="warning">Revisar duplicado</StatusBadge>
              ) : null}
              {priceCents ? <StatusBadge tone={payTone.tone}>{payTone.text}</StatusBadge> : null}
            </>
          )}
          {priceCents ? (
            <span className="text-muted-foreground text-sm">
              {formatCents(reg.amount_paid_cents)} / {formatCents(priceCents)}
            </span>
          ) : null}
        </div>
      </summary>

      <div className="mt-4 space-y-4 text-sm">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Item label="Dirección" value={reg.address} />
          <Item label="Edad" value={String(reg.age)} />
          <Item label="Emergencia" value={`${reg.emergency_name} · ${reg.emergency_phone}`} />
          <Item
            label="Persevera en una iglesia"
            value={
              reg.attends_church ? `Sí${reg.church_name ? ` — ${reg.church_name}` : ""}` : "No"
            }
          />
          <Item
            label="Condición médica"
            value={
              reg.has_medical_condition
                ? `Sí${reg.medical_details ? ` — ${reg.medical_details}` : " (sin detalles)"}`
                : "No"
            }
          />
          <Item label="Inscrito" value={formatChurchShortDate(reg.created_at)} />
        </dl>

        {message ? (
          <p className={message.ok ? "text-muted-foreground" : "text-destructive"} role="status">
            {message.text}
          </p>
        ) : null}

        {!reg.cancelled_at && reg.match_status === "posible_duplicado" ? (
          <div className="space-y-2 rounded-md border border-amber-300 p-3 dark:border-amber-800">
            <p className="font-medium">¿Es alguna de estas personas?</p>
            <p className="text-muted-foreground">
              Coincide el email, el teléfono o el nombre. Confirma para no crear un duplicado.
            </p>
            <ul className="space-y-2">
              {reg.candidates.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <a href={`/personas/${c.id}`} className="font-medium underline" target="_blank">
                      {c.first_name} {c.last_name}
                    </a>
                    <span className="text-muted-foreground">
                      {" "}
                      · {[c.email, c.phone].filter(Boolean).join(" · ") || "sin contacto"}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => linkRegistrationAction(activityId, reg.id, c.id))}
                  >
                    Sí, es esta persona
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => linkRegistrationAction(activityId, reg.id, null))}
            >
              No es ninguna: crear persona nueva
            </Button>
          </div>
        ) : null}

        {reg.payments.length > 0 ? (
          <div>
            <p className="mb-1 font-medium">Pagos</p>
            <ul className="space-y-1">
              {reg.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span>
                    {formatCents(p.amount_cents)} · {methodLabels[p.method]} · {p.paid_on}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      if (confirm("¿Borrar este pago?")) {
                        run(() => deleteRegistrationPaymentAction(activityId, reg.id, p.id));
                      }
                    }}
                  >
                    Borrar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!reg.cancelled_at ? (
          <>
            <PaymentForm
              activityId={activityId}
              registrationId={reg.id}
              suggested={
                depositCents && reg.amount_paid_cents === 0 ? depositCents : balance || null
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(
                    () => resendConfirmationAction(activityId, reg.id),
                    `Confirmación reenviada a ${reg.email}.`,
                  )
                }
              >
                Reenviar confirmación
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (
                    confirm(`¿Cancelar la inscripción de ${reg.first_name}? Se libera su espacio.`)
                  ) {
                    run(() => cancelRegistrationAction(activityId, reg.id));
                  }
                }}
              >
                Cancelar inscripción
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </details>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

const initialPayment: ActionResult<string | undefined> = { ok: true, data: undefined };

function PaymentForm({
  activityId,
  registrationId,
  suggested,
}: {
  activityId: string;
  registrationId: string;
  suggested: number | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult<string | undefined>, fd: FormData) =>
      addRegistrationPaymentAction(activityId, registrationId, fd),
    initialPayment,
  );
  const [method, setMethod] = useState<RegistrationPaymentMethod>("ath_movil");
  const id = (f: string) => `${f}-${registrationId}`;

  return (
    <form action={formAction} className="bg-muted/40 space-y-3 rounded-md p-3">
      <p className="font-medium">Registrar pago</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={id("amount")}>Monto</Label>
          <Input
            id={id("amount")}
            name="amount"
            inputMode="decimal"
            required
            defaultValue={suggested ? (suggested / 100).toFixed(2) : ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("method")}>Método</Label>
          <input type="hidden" name="method" value={method} />
          <Select value={method} onValueChange={(v) => setMethod(v as RegistrationPaymentMethod)}>
            <SelectTrigger id={id("method")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(methodLabels).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("paidOn")}>Fecha</Label>
          <Input
            id={id("paidOn")}
            name="paidOn"
            type="date"
            required
            defaultValue={churchDateKey()}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id("reference")}>Referencia</Label>
          <Input id={id("reference")} name="reference" maxLength={100} placeholder="# ATH" />
        </div>
      </div>
      {!state.ok ? <p className="text-destructive">{state.error}</p> : null}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando..." : "Guardar pago"}
      </Button>
      {state.ok && state.data === "guardado" ? (
        <span className="text-muted-foreground ml-3">Pago registrado.</span>
      ) : null}
    </form>
  );
}
