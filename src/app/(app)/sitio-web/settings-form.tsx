"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaField } from "@/components/site/media-picker";
import type { SiteMediaRow, SiteSettingsRow } from "@/types/database";
import { saveSiteSettingsAction } from "./actions";

export function SiteSettingsForm({
  settings,
  media,
}: {
  settings: SiteSettingsRow;
  media: SiteMediaRow[];
}) {
  const [v, setV] = useState({
    heroEyebrow: settings.hero_eyebrow,
    heroTitle: settings.hero_title,
    heroSubtitle: settings.hero_subtitle ?? "",
    heroMediaId: settings.hero_media_id,
    aboutTitle: settings.about_title,
    aboutText: settings.about_text ?? "",
    aboutMediaId: settings.about_media_id,
    missionText: settings.mission_text ?? "",
    address: settings.address ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    mapQuery: settings.map_query ?? "",
    instagramUrl: settings.instagram_url ?? "",
    facebookUrl: settings.facebook_url ?? "",
    youtubeUrl: settings.youtube_url ?? "",
    portalUrl: settings.portal_url,
  });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const text = (
    k: keyof typeof v,
    label: string,
    opts: { hint?: string; area?: boolean; rows?: number } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      {opts.area ? (
        <Textarea
          id={k}
          rows={opts.rows ?? 3}
          value={String(v[k] ?? "")}
          onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
        />
      ) : (
        <Input
          id={k}
          value={String(v[k] ?? "")}
          onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
        />
      )}
      {opts.hint ? <p className="text-muted-foreground text-xs">{opts.hint}</p> : null}
    </div>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    try {
      const res = await saveSiteSettingsAction({
        ...v,
        heroMediaId: v.heroMediaId ?? "",
        aboutMediaId: v.aboutMediaId ?? "",
      });
      setMsg(
        res.ok
          ? { ok: true, text: "Guardado. El sitio ya muestra los cambios." }
          : { ok: false, text: res.error },
      );
    } catch {
      setMsg({ ok: false, text: "No hubo respuesta del servidor. No se guardó." });
    } finally {
      setPending(false);
    }
  }

  const section =
    "bg-card ring-foreground/10 grid grid-cols-1 gap-4 rounded-xl p-4 shadow-xs ring-1 sm:p-6 md:grid-cols-2";

  return (
    <form onSubmit={submit} className="max-w-4xl space-y-6">
      <fieldset className={section}>
        <legend className="sr-only">Portada</legend>
        <h2 className="text-base font-semibold md:col-span-2">Portada</h2>
        {text("heroEyebrow", "Texto pequeño arriba del título")}
        {text("heroTitle", "Título grande")}
        <div className="md:col-span-2">
          {text("heroSubtitle", "Frase debajo del título", { area: true, rows: 2 })}
        </div>
        <MediaField
          label="Foto de fondo"
          media={media}
          value={v.heroMediaId}
          onChange={(id) => setV((s) => ({ ...s, heroMediaId: id }))}
        />
      </fieldset>

      <fieldset className={section}>
        <legend className="sr-only">Quiénes somos</legend>
        <h2 className="text-base font-semibold md:col-span-2">Quiénes somos</h2>
        {text("aboutTitle", "Título")}
        <MediaField
          label="Foto"
          media={media}
          value={v.aboutMediaId}
          onChange={(id) => setV((s) => ({ ...s, aboutMediaId: id }))}
        />
        <div className="md:col-span-2">
          {text("aboutText", "Historia y visión", {
            area: true,
            rows: 6,
            hint: "Deja una línea en blanco entre párrafos. Si queda vacío, no se muestra.",
          })}
        </div>
        <div className="md:col-span-2">
          {text("missionText", "Frase de misión (se usa como cita y en el pie de página)", {
            area: true,
            rows: 2,
          })}
        </div>
      </fieldset>

      <fieldset className={section}>
        <legend className="sr-only">Contacto</legend>
        <h2 className="text-base font-semibold md:col-span-2">Contacto y redes</h2>
        <div className="md:col-span-2">{text("address", "Dirección")}</div>
        {text("phone", "Teléfono")}
        {text("email", "Email")}
        <div className="md:col-span-2">
          {text("mapQuery", "Búsqueda para el mapa", {
            hint: "La dirección tal como la encuentra Google Maps.",
          })}
        </div>
        {text("instagramUrl", "Instagram (enlace)")}
        {text("facebookUrl", "Facebook (enlace)")}
        {text("youtubeUrl", "YouTube (enlace del canal)")}
        {text("portalUrl", "Enlace del portal de miembros")}
      </fieldset>

      <p className="text-muted-foreground text-sm">
        Los horarios de culto se toman de <strong>Asistencia → Programación de cultos</strong>: si
        cambias un horario allí, el sitio se actualiza solo.
      </p>

      {msg ? (
        <p
          role={msg.ok ? "status" : "alert"}
          className={msg.ok ? "text-state-active text-sm" : "text-destructive text-sm"}
        >
          {msg.text}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
