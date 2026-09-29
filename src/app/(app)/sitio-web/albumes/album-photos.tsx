"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaPicker, MediaThumb } from "@/components/site/media-picker";
import { cn } from "@/lib/utils";
import type { SiteAlbumRow, SiteMediaRow } from "@/types/database";
import {
  addAlbumPhotosAction,
  removeAlbumPhotoAction,
  reorderAlbumAction,
  saveAlbumAction,
} from "../actions";

export function AlbumPhotos({
  album,
  photoIds,
  media,
}: {
  album: SiteAlbumRow;
  photoIds: string[];
  media: SiteMediaRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState(photoIds);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(media.map((m) => [m.id, m]));

  async function run(p: Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const res = await p;
    if (!res.ok) setError(res.error ?? "No se pudo guardar.");
    router.refresh();
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
    void run(reorderAlbumAction(album.id, next));
  }

  function setCover(mediaId: string) {
    void run(
      saveAlbumAction({
        id: album.id,
        title: album.title,
        slug: album.slug,
        description: album.description ?? "",
        albumDate: album.album_date ?? "",
        coverMediaId: mediaId,
        published: album.published,
        sortOrder: album.sort_order,
      }),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Fotos del álbum ({order.length})</h2>
        <Button onClick={() => setOpen(true)}>
          <ImagePlus className="size-4" aria-hidden />
          Agregar fotos
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {order.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todavía no tiene fotos. Toca «Agregar fotos».
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {order.map((id, i) => {
            const cover = album.cover_media_id === id || (!album.cover_media_id && i === 0);
            return (
              <li
                key={id}
                className={cn("space-y-1 rounded-lg p-1", cover && "ring-primary ring-2")}
              >
                <MediaThumb media={byId.get(id)} className="aspect-square w-full" />
                <div className="flex items-center justify-between">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Mover antes"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Usar como portada"
                    aria-pressed={cover}
                    onClick={() => setCover(id)}
                  >
                    <Star className={cn("size-4", cover && "fill-current")} aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Quitar del álbum"
                    onClick={() => void run(removeAlbumPhotoAction(album.id, id))}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Mover después"
                    onClick={() => move(i, 1)}
                    disabled={i === order.length - 1}
                  >
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        La estrella marca la portada (si no eliges ninguna, se usa la primera).
      </p>
      <MediaPicker
        media={media.filter((m) => !order.includes(m.id))}
        open={open}
        onOpenChange={setOpen}
        multiple
        title="Agregar fotos al álbum"
        onPick={(ids) => void run(addAlbumPhotosAction(album.id, ids))}
      />
    </div>
  );
}
