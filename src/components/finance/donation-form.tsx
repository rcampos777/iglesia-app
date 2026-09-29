"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { donationTypeLabels, paymentMethodLabels } from "@/lib/labels";
import { parseAmountToCents, formatCents } from "@/lib/money";
import type { DonationPaymentMethod, DonationType } from "@/types/database";
import { createDonationAction, correctDonationAction } from "@/app/(app)/finanzas/actions";
import { PersonPicker, type PickedPerson } from "./person-picker";

type Initial = {
  person: PickedPerson | null;
  anonymous: boolean;
  date: string;
  amount: string;
  type: DonationType | "";
  method: DonationPaymentMethod | "";
  reference: string;
};

const NETWORK =
  "No hubo respuesta del servidor. La donación todavía NO aparece como registrada. Vuelve a tocar el botón: no se duplicará.";

function newKey() {
  return crypto.randomUUID();
}

export function DonationForm({
  mode,
  today,
  initial,
  donationId,
  version,
}: {
  mode: "crear" | "corregir";
  today: string;
  initial?: Initial;
  donationId?: string;
  version?: number;
}) {
  const router = useRouter();
  const start: Initial = initial ?? {
    person: null,
    anonymous: false,
    date: today,
    amount: "",
    type: "",
    method: "",
    reference: "",
  };
  const [key, setKey] = useState(newKey);
  const [person, setPerson] = useState<PickedPerson | null>(start.person);
  const [anonymous, setAnonymous] = useState(start.anonymous);
  const [date, setDate] = useState(start.date);
  const [amount, setAmount] = useState(start.amount);
  const [type, setType] = useState(start.type);
  const [method, setMethod] = useState(start.method);
  const [reference, setReference] = useState(start.reference);
  const [prayer, setPrayer] = useState("");
  const [share, setShare] = useState(false);
  const [shareAuthorized, setShareAuthorized] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string } | null>(null);

  const cents = parseAmountToCents(amount);

  function reset() {
    setKey(newKey());
    setPerson(null);
    setAnonymous(false);
    setAmount("");
    setReference("");
    setPrayer("");
    setShare(false);
    setShareAuthorized(false);
    setSaved(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const fields = {
      personId: anonymous ? null : (person?.id ?? null),
      anonymous,
      date,
      amount,
      type: type as DonationType,
      method: method as DonationPaymentMethod,
      reference,
    };
    setPending(true);
    try {
      if (mode === "crear") {
        const res = await createDonationAction({
          ...fields,
          idempotencyKey: key,
          prayer,
          share,
          shareAuthorized,
        });
        if (res.ok) setSaved({ id: res.data.id });
        else setError(res.error);
      } else {
        const res = await correctDonationAction({
          ...fields,
          donationId: donationId!,
          version: version!,
          reason,
        });
        if (res.ok) router.push(`/finanzas/${donationId}?corregida=1`);
        else setError(res.error);
      }
    } catch {
      setError(mode === "crear" ? NETWORK : "No hubo respuesta del servidor. Intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <div className="space-y-4" role="status">
        <div className="border-state-active/40 bg-state-active/10 flex items-start gap-3 rounded-xl border p-4">
          <CheckCircle2 className="text-state-active mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Donación registrada.</p>
            <p className="text-muted-foreground text-sm">
              {anonymous ? "Anónima" : person?.name} · {cents !== null ? formatCents(cents) : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={reset}>Registrar otra</Button>
          <Button asChild variant="outline">
            <Link href={`/finanzas/${saved.id}`}>Ver detalle</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Donante</legend>
        {!anonymous ? (
          <PersonPicker id="donante" value={person} onChange={setPerson} disabled={pending} />
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={anonymous}
            onCheckedChange={(v) => {
              setAnonymous(v === true);
              if (v === true) setPerson(null);
            }}
            disabled={pending}
          />
          Donación anónima (no se asocia a ninguna persona ni aparece en cartas)
        </label>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fecha">Fecha de la donación</Label>
          <Input
            id="fecha"
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cantidad">Cantidad (USD)</Label>
          <div className="relative">
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
              $
            </span>
            <Input
              id="cantidad"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amount !== "" && cents === null}
              aria-describedby="cantidad-ayuda"
              required
              disabled={pending}
              className="pl-6"
            />
          </div>
          <p id="cantidad-ayuda" className="text-muted-foreground text-sm">
            {amount !== "" && cents === null
              ? "Escribe una cantidad válida, por ejemplo 25 o 25.50."
              : cents !== null
                ? formatCents(cents)
                : "Hasta dos decimales."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as DonationType)} disabled={pending}>
            <SelectTrigger id="tipo" className="w-full">
              <SelectValue placeholder="Elige el tipo" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(donationTypeLabels) as DonationType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {donationTypeLabels[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="forma">Forma de pago</Label>
          <Select
            value={method}
            onValueChange={(v) => setMethod(v as DonationPaymentMethod)}
            disabled={pending}
          >
            <SelectTrigger id="forma" className="w-full">
              <SelectValue placeholder="Elige la forma de pago" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(paymentMethodLabels) as DonationPaymentMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {paymentMethodLabels[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="referencia">Referencia (opcional)</Label>
          <Input
            id="referencia"
            value={reference}
            maxLength={80}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Núm. de cheque o confirmación. Nunca números de tarjeta."
            disabled={pending}
          />
        </div>
      </div>

      {mode === "crear" ? (
        <fieldset className="bg-muted/40 space-y-3 rounded-lg border p-3 sm:p-4">
          <div className="space-y-1.5">
            <Label htmlFor="peticion">Petición de oración (opcional)</Label>
            <Textarea
              id="peticion"
              value={prayer}
              maxLength={2000}
              onChange={(e) => {
                setPrayer(e.target.value);
                if (!e.target.value.trim()) {
                  setShare(false);
                  setShareAuthorized(false);
                }
              }}
              placeholder="Si el sobre trae una petición, cópiala aquí. Puede quedar vacío."
              disabled={pending}
            />
            <p className="text-muted-foreground text-sm">
              Confidencial: se guarda aparte y no aparece en listados, reportes, exportaciones ni
              cartas.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={share}
              onCheckedChange={(v) => {
                setShare(v === true);
                if (v !== true) setShareAuthorized(false);
              }}
              disabled={pending || !prayer.trim()}
              className="mt-0.5"
            />
            Compartir con intercesión (solo el texto y el nombre; nunca datos de la donación)
          </label>
          {share ? (
            <label className="border-state-warning/40 bg-state-warning/10 flex items-start gap-2 rounded-md border p-2.5 text-sm">
              <Checkbox
                checked={shareAuthorized}
                onCheckedChange={(v) => setShareAuthorized(v === true)}
                disabled={pending}
                className="mt-0.5"
              />
              Confirmo que la persona autorizó compartir su petición con el equipo de intercesión.
              Quedará registrado que yo lo indiqué.
            </label>
          ) : null}
        </fieldset>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="motivo">Motivo de la corrección</Label>
          <Textarea
            id="motivo"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: se contó mal el efectivo"
            required
            disabled={pending}
          />
          <p className="text-muted-foreground text-sm">
            Se conservan los valores anteriores, tu nombre y la fecha.
          </p>
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={
            pending ||
            cents === null ||
            !type ||
            !method ||
            (!anonymous && !person) ||
            (share && !shareAuthorized) ||
            (mode === "corregir" && reason.trim().length < 5)
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {mode === "crear" ? "Registrar donación" : "Guardar corrección"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={mode === "crear" ? "/finanzas" : `/finanzas/${donationId}`}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
