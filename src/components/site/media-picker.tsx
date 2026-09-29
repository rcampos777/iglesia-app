"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { siteMediaUrl } from "@/lib/site/media";
import type { SiteMediaRow } from "@/types/database";
import { MediaUploader } from "./media-uploader";

export function MediaThumb({
  media,
  className,
  sizes = "160px",
}: {
  media: SiteMediaRow | null | undefined;
  className?: string;
  sizes?: string;
}) {
  if (!media) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground flex items-center justify-center rounded-md",
          className,
        )}
      >
        <ImageIcon className="size-5" aria-hidden />
      </div>
    );
  }
  return (
    <div className={cn("bg-muted relative overflow-hidden rounded-md", className)}>
      <Image
        src={siteMediaUrl(media.thumb_path)}
        alt={media.alt_text}
        fill
        sizes={sizes}
        unoptimized
        className="object-cover"
      />
    </div>
  );
}

/**
 * Elegir una foto (o varias) de la biblioteca, o subir nuevas en el mismo
 * diálogo. Las recién subidas quedan seleccionadas.
 */
export function MediaPicker({
  media,
  open,
  onOpenChange,
  onPick,
  multiple = false,
  title = "Elegir foto",
}: {
  media: SiteMediaRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (ids: string[]) => void;
  multiple?: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((s) =>
      multiple ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id],
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setSelected([]);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {multiple ? "Toca las fotos que quieras agregar." : "Toca una foto."} También puedes
            subir nuevas.
          </DialogDescription>
        </DialogHeader>
        <MediaUploader
          multiple={multiple}
          onUploaded={(ids) => {
            setSelected((s) => (multiple ? [...s, ...ids] : ids.slice(-1)));
            router.refresh();
          }}
        />
        {media.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Todavía no hay fotos.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {media.map((m) => {
              const on = selected.includes(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => toggle(m.id)}
                    aria-pressed={on}
                    aria-label={m.alt_text || "Foto"}
                    className={cn(
                      "relative block w-full rounded-md ring-offset-2 transition",
                      on ? "ring-primary ring-2" : "hover:opacity-90",
                    )}
                  >
                    <MediaThumb media={m} className="aspect-square w-full" />
                    {on ? (
                      <span className="bg-primary text-primary-foreground absolute top-1 right-1 rounded-full p-0.5">
                        <Check className="size-3.5" aria-hidden />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={selected.length === 0}
            onClick={() => {
              onPick(selected);
              setSelected([]);
              onOpenChange(false);
            }}
          >
            {multiple ? `Agregar ${selected.length || ""}`.trim() : "Usar esta foto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Campo de formulario: foto elegida + cambiar/quitar. */
export function MediaField({
  label,
  media,
  value,
  onChange,
}: {
  label: string;
  media: SiteMediaRow[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = media.find((m) => m.id === value) ?? null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <MediaThumb media={current} className="size-20 shrink-0" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {current ? "Cambiar" : "Elegir foto"}
          </Button>
          {current ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="size-4" aria-hidden />
              Quitar
            </Button>
          ) : null}
        </div>
      </div>
      <MediaPicker
        media={media}
        open={open}
        onOpenChange={setOpen}
        onPick={(ids) => onChange(ids[0] ?? null)}
      />
    </div>
  );
}
