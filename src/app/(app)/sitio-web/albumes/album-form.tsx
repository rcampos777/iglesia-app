"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { SiteAlbumRow } from "@/types/database";
import { deleteAlbumAction, saveAlbumAction } from "../actions";

export function AlbumForm({ album }: { album?: SiteAlbumRow }) {
  const router = useRouter();
  const [v, setV] = useState({
    title: album?.title ?? "",
    slug: album?.slug ?? "",
    description: album?.description ?? "",
    albumDate: album?.album_date ?? "",
    published: album?.published ?? false,
    sortOrder: String(album?.sort_order ?? 0),
  });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    try {
      const res = await saveAlbumAction({
        id: album?.id ?? null,
        ...v,
        coverMediaId: album?.cover_media_id ?? "",
      });
      if (!res.ok) setMsg({ ok: false, text: res.error });
      else if (!album) router.push(`/sitio-web/albumes/${res.data.id}`);
      else {
        setMsg({ ok: true, text: "Guardado." });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "No hubo respuesta del servidor." });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!album) return;
    const res = await deleteAlbumAction(album.id);
    if (res.ok) router.push("/sitio-web/albumes");
    else setMsg({ ok: false, text: res.error });
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="al-title">Título</Label>
        <Input
          id="al-title"
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          required
          maxLength={120}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="al-date">Fecha (opcional)</Label>
        <Input
          id="al-date"
          type="date"
          value={v.albumDate}
          onChange={(e) => setV({ ...v, albumDate: e.target.value })}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="al-desc">Descripción (opcional)</Label>
        <Textarea
          id="al-desc"
          rows={2}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </div>
      {album ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="al-slug">Dirección del álbum</Label>
            <Input
              id="al-slug"
              value={v.slug}
              onChange={(e) => setV({ ...v, slug: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">/sitio/albumes/{v.slug || "…"}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="al-order">Orden (menor primero)</Label>
            <Input
              id="al-order"
              type="number"
              value={v.sortOrder}
              onChange={(e) => setV({ ...v, sortOrder: e.target.value })}
            />
          </div>
        </>
      ) : null}
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <Checkbox
          checked={v.published}
          onCheckedChange={(c) => setV({ ...v, published: c === true })}
        />
        Publicado (visible en el sitio)
      </label>
      {msg ? (
        <p
          role={msg.ok ? "status" : "alert"}
          className={
            msg.ok
              ? "text-state-active text-sm sm:col-span-2"
              : "text-destructive text-sm sm:col-span-2"
          }
        >
          {msg.text}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : album ? "Guardar" : "Crear álbum"}
        </Button>
        {album ? (
          confirmDelete ? (
            <>
              <Button type="button" variant="destructive" onClick={() => void remove()}>
                Sí, borrar álbum
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              Borrar álbum
            </Button>
          )
        ) : null}
      </div>
      {album && confirmDelete ? (
        <p className="text-muted-foreground text-xs sm:col-span-2">
          Las fotos siguen en la biblioteca; solo se borra el álbum.
        </p>
      ) : null}
    </form>
  );
}
