"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { FinanceSettingsRow } from "@/types/database";
import { updateFinanceSettingsAction } from "../actions";

export function SettingsForm({
  settings,
  canApprove,
}: {
  settings: FinanceSettingsRow;
  canApprove: boolean;
}) {
  const [v, setV] = useState({
    churchName: settings.church_name,
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    taxId: settings.tax_id ?? "",
    recipient: settings.letter_recipient,
    body: settings.letter_body,
    closing: settings.letter_closing,
    signerName: settings.signer_name ?? "",
    signerTitle: settings.signer_title ?? "",
    templateStatus: settings.template_status,
  });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set =
    (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    try {
      const res = await updateFinanceSettingsAction(v);
      setMsg(
        res.ok
          ? { ok: true, text: "Guardado. Aplica a las cartas que se emitan desde ahora." }
          : { ok: false, text: res.error },
      );
    } catch {
      setMsg({ ok: false, text: "No hubo respuesta del servidor. No se guardó." });
    } finally {
      setPending(false);
    }
  }

  const field = (k: keyof typeof v, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={String(v[k])} onChange={set(k)} disabled={pending} />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold">Datos de la iglesia (membrete)</legend>
        {field("churchName", "Nombre")}
        {field("phone", "Teléfono", "Vacío = no se imprime.")}
        <div className="sm:col-span-2">
          {field("address", "Dirección", "Vacío = no se imprime. No se inventa.")}
        </div>
        {field("email", "Email")}
        {field(
          "taxId",
          "Número de identificación",
          "Solo el que la iglesia confirme. Vacío = no se imprime.",
        )}
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold">Texto de la carta</legend>
        <div className="sm:col-span-2">{field("recipient", "Destinatario")}</div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="body">Texto principal</Label>
          <Textarea
            id="body"
            rows={5}
            value={v.body}
            onChange={set("body")}
            disabled={pending}
            maxLength={3000}
          />
          <p className="text-muted-foreground text-xs">
            Marcadores: {"{donante}"}, {"{iglesia}"}, {"{periodo}"}, {"{total}"}. El total lo
            calcula el sistema; no escribas montos aquí. No afirmes deducibilidad sin revisión.
          </p>
        </div>
        {field("closing", "Despedida")}
        <div />
        {field("signerName", "Nombre del firmante", "Vacío = queda la línea para completar.")}
        {field("signerTitle", "Cargo del firmante")}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-base font-semibold">Estado de la plantilla</legend>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={v.templateStatus === "aprobada"}
            disabled={!canApprove || pending}
            onCheckedChange={(c) =>
              setV((s) => ({ ...s, templateStatus: c === true ? "aprobada" : "borrador" }))
            }
            className="mt-0.5"
          />
          Plantilla revisada y aprobada (quita el aviso de BORRADOR de las cartas nuevas).
          {!canApprove ? " Solo un SuperAdmin puede cambiarlo." : ""}
        </label>
      </fieldset>
      {msg ? (
        <p
          role={msg.ok ? "status" : "alert"}
          className={msg.ok ? "text-state-active text-sm" : "text-destructive text-sm"}
        >
          {msg.text}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar configuración"}
      </Button>
    </form>
  );
}
