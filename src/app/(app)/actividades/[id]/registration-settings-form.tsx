"use client";

import { useActionState, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { centsToPlain } from "@/lib/money";
import { siteMediaUrl } from "@/lib/site/media";
import type { ActionResult } from "@/lib/action-result";
import type { MediaOption } from "@/lib/data/registrations";
import type { ActivityRow } from "@/types/database";
import { updateRegistrationSettingsAction } from "./registration-actions";

const initialState: ActionResult<string | undefined> = { ok: true, data: undefined };

function suggestSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function RegistrationSettingsForm({
  activity,
  media,
  publicBaseUrl,
}: {
  activity: ActivityRow;
  media: MediaOption[];
  publicBaseUrl: string;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<string | undefined>, fd: FormData) =>
      updateRegistrationSettingsAction(activity.id, fd),
    initialState,
  );
  const [open, setOpen] = useState(activity.registration_open);
  const [slug, setSlug] = useState(activity.registration_slug ?? suggestSlug(activity.name));
  const [flyer, setFlyer] = useState(activity.flyer_media_id ?? "none");
  const [copied, setCopied] = useState(false);

  const fieldError = (name: string) =>
    !state.ok && state.fieldErrors?.[name] ? state.fieldErrors[name][0] : null;
  const publicUrl = `${publicBaseUrl}/inscripcion/${slug}`;
  const flyerMedia = media.find((m) => m.id === flyer);

  return (
    <form action={formAction} className="space-y-5">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Switch
          id="registrationOpen"
          name="registrationOpen"
          checked={open}
          onCheckedChange={setOpen}
        />
        <Label htmlFor="registrationOpen">
          {open ? "Inscripción abierta al público" : "Inscripción cerrada"}
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="registrationSlug">Dirección de la forma</Label>
        <Input
          id="registrationSlug"
          name="registrationSlug"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          maxLength={80}
          placeholder="retiro-hombres-2026"
        />
        {fieldError("registrationSlug") ? (
          <p className="text-destructive text-sm">{fieldError("registrationSlug")}</p>
        ) : slug ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <code className="bg-muted rounded px-2 py-1 break-all">{publicUrl}</code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(publicUrl).then(() => setCopied(true));
              }}
            >
              <Copy className="size-4" aria-hidden />
              {copied ? "Copiado" : "Copiar"}
            </Button>
            {activity.registration_open && activity.registration_slug === slug ? (
              <Button asChild variant="ghost" size="sm">
                <a href={`/sitio/inscripcion/${slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" aria-hidden />
                  Ver forma
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
        <p className="text-muted-foreground text-sm">
          Pon este enlace en el evento del sitio web, en redes o por WhatsApp.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="price">Costo total ($)</Label>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            defaultValue={activity.price_cents != null ? centsToPlain(activity.price_cents) : ""}
            placeholder="150.00"
          />
          {fieldError("price") && <p className="text-destructive text-sm">{fieldError("price")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="deposit">Depósito para reservar ($)</Label>
          <Input
            id="deposit"
            name="deposit"
            inputMode="decimal"
            defaultValue={
              activity.deposit_cents != null ? centsToPlain(activity.deposit_cents) : ""
            }
            placeholder="50.00"
          />
          {fieldError("deposit") && (
            <p className="text-destructive text-sm">{fieldError("deposit")}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="registrationClosesOn">Cerrar inscripción el</Label>
          <Input
            id="registrationClosesOn"
            name="registrationClosesOn"
            type="date"
            defaultValue={activity.registration_closes_on ?? ""}
          />
          <p className="text-muted-foreground text-xs">Vacío: hasta el día de la actividad.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paymentInstructions">Cómo pagar</Label>
        <Textarea
          id="paymentInstructions"
          name="paymentInstructions"
          rows={3}
          maxLength={2000}
          defaultValue={activity.payment_instructions ?? ""}
          placeholder={
            "ATH Móvil: /NombreIglesia (escribe tu nombre y “Retiro” en el mensaje).\nO en efectivo con el tesorero después del culto."
          }
        />
        <p className="text-muted-foreground text-sm">
          Sale en el email de confirmación, en los recordatorios y al terminar la forma.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmationMessage">Carta de bienvenida (email de confirmación)</Label>
        <Textarea
          id="confirmationMessage"
          name="confirmationMessage"
          rows={8}
          maxLength={5000}
          defaultValue={activity.confirmation_message ?? ""}
          placeholder={"Estimado hermano {{Nombre}},\n\n¡Gracias por inscribirte!..."}
        />
        {fieldError("confirmationMessage") ? (
          <p className="text-destructive text-sm">{fieldError("confirmationMessage")}</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Va al principio del email que recibe cada persona al inscribirse. Escribe{" "}
            <code>{"{{Nombre}}"}</code> donde quieras que salga su nombre. Debajo se añaden solos la
            fecha, el lugar, el costo y cómo pagar.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatToBring">Qué llevar (recordatorio antes de la actividad)</Label>
        <Textarea
          id="whatToBring"
          name="whatToBring"
          rows={3}
          maxLength={2000}
          defaultValue={activity.what_to_bring ?? ""}
          placeholder="Biblia, libreta, ropa cómoda, abrigo, artículos de aseo, sábanas..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactInfo">Contacto para más información</Label>
        <Textarea
          id="contactInfo"
          name="contactInfo"
          rows={2}
          maxLength={500}
          defaultValue={activity.contact_info ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notifyEmails">Avisar de cada inscripción a</Label>
        <Input
          id="notifyEmails"
          name="notifyEmails"
          defaultValue={activity.notify_emails.join(", ")}
          placeholder="organizador@ejemplo.org, tesorero@ejemplo.org"
        />
        {fieldError("notifyEmails") ? (
          <p className="text-destructive text-sm">{fieldError("notifyEmails")}</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Hasta 5 correos, separados por coma. El responsable de la actividad también recibe el
            aviso. Las respuestas de los inscritos llegan a estos correos.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="flyerMediaId">Flyer (de las fotos del sitio web)</Label>
        <input type="hidden" name="flyerMediaId" value={flyer} />
        <Select value={flyer} onValueChange={setFlyer}>
          <SelectTrigger id="flyerMediaId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin flyer</SelectItem>
            {media.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.alt_text || m.storage_path.split("/").pop()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {flyerMedia ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={siteMediaUrl(flyerMedia.thumb_path)}
            alt=""
            className="mt-2 h-28 w-auto rounded-md border"
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            Sube el flyer en Sitio web → Fotos y luego elígelo aquí.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar inscripción en línea"}
        </Button>
        {state.ok && state.data === "guardado" && (
          <span className="text-muted-foreground text-sm">Cambios guardados.</span>
        )}
      </div>
    </form>
  );
}
