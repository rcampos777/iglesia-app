"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaThumb } from "@/components/site/media-picker";
import { MediaUploader } from "@/components/site/media-uploader";
import type { SiteMediaRow } from "@/types/database";
import { deleteMediaAction, updateMediaAltAction } from "../actions";

function PhotoCard({ m }: { m: SiteMediaRow }) {
  const router = useRouter();
  const [alt, setAlt] = useState(m.alt_text);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveAlt() {
    if (alt === m.alt_text) return;
    const res = await updateMediaAltAction(m.id, alt);
    if (res.ok) setSaved(true);
    else setError(res.error);
  }

  async function remove() {
    setBusy(true);
    const res = await deleteMediaAction(m.id);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <li className="bg-card ring-foreground/10 space-y-2 rounded-xl p-2 shadow-xs ring-1">
      <MediaThumb
        media={m}
        className="aspect-[4/3] w-full"
        sizes="(max-width: 640px) 50vw, 240px"
      />
      <Input
        aria-label="Descripción de la foto"
        value={alt}
        placeholder="Describe la foto"
        maxLength={200}
        onChange={(e) => {
          setAlt(e.target.value);
          setSaved(false);
        }}
        onBlur={() => void saveAlt()}
        className="h-8 text-sm"
      />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {saved ? "Guardado" : `${m.width ?? "?"}×${m.height ?? "?"}`}
        </span>
        {confirm ? (
          <span className="flex gap-1">
            <Button size="sm" variant="destructive" onClick={() => void remove()} disabled={busy}>
              Borrar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              No
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setConfirm(true)}
            aria-label="Borrar foto"
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </li>
  );
}

export function PhotoLibrary({ media }: { media: SiteMediaRow[] }) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="bg-card ring-foreground/10 space-y-2 rounded-xl p-4 shadow-xs ring-1">
        <p className="text-sm">
          Sube las fotos aquí (varias a la vez). Se reducen solas para que la página cargue rápido.
          Escribe una descripción corta de cada foto: la usan los lectores de pantalla y Google.
        </p>
        <MediaUploader onUploaded={() => router.refresh()} />
      </div>
      {media.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay fotos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {media.map((m) => (
            <PhotoCard key={m.id} m={m} />
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        Al borrar una foto se quita también de los álbumes donde esté y de las secciones que la
        usen.
      </p>
    </div>
  );
}
