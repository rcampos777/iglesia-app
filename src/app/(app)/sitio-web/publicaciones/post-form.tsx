"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MediaField } from "@/components/site/media-picker";
import { isoToPrLocalInput, prLocalInputToIso } from "@/lib/datetime";
import type { SiteMediaRow, SitePostRow } from "@/types/database";
import { deletePostAction, savePostAction } from "../actions";

export function PostForm({ post, media }: { post?: SitePostRow; media: SiteMediaRow[] }) {
  const router = useRouter();
  const [v, setV] = useState({
    kind: post?.kind ?? ("evento" as "evento" | "anuncio"),
    title: post?.title ?? "",
    body: post?.body ?? "",
    startsAt: isoToPrLocalInput(post?.starts_at ?? null),
    endsAt: isoToPrLocalInput(post?.ends_at ?? null),
    location: post?.location ?? "",
    mediaId: post?.media_id ?? null,
    linkUrl: post?.link_url ?? "",
    linkLabel: post?.link_label ?? "",
    visibleUntil: post?.visible_until ?? "",
    published: post?.published ?? false,
  });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set =
    (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    try {
      const res = await savePostAction({
        id: post?.id ?? null,
        ...v,
        mediaId: v.mediaId ?? "",
        startsAt: v.startsAt ? prLocalInputToIso(v.startsAt) : null,
        endsAt: v.endsAt ? prLocalInputToIso(v.endsAt) : null,
      });
      if (!res.ok) setMsg({ ok: false, text: res.error });
      else if (!post) router.push(`/sitio-web/publicaciones?editar=${res.data.id}`);
      else {
        setMsg({
          ok: true,
          text: v.published ? "Guardado y publicado." : "Guardado como borrador.",
        });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "No hubo respuesta del servidor. No se guardó." });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!post) return;
    const res = await deletePostAction(post.id);
    if (res.ok) router.push("/sitio-web/publicaciones");
    else setMsg({ ok: false, text: res.error });
  }

  const isEvent = v.kind === "evento";
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <fieldset className="flex gap-2 sm:col-span-2">
        <legend className="sr-only">Tipo</legend>
        {(["evento", "anuncio"] as const).map((k) => (
          <Button
            key={k}
            type="button"
            variant={v.kind === k ? "default" : "outline"}
            aria-pressed={v.kind === k}
            onClick={() => setV({ ...v, kind: k })}
          >
            {k === "evento" ? "Evento (con fecha)" : "Anuncio"}
          </Button>
        ))}
      </fieldset>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="p-title">Título</Label>
        <Input id="p-title" value={v.title} onChange={set("title")} required maxLength={150} />
      </div>
      {isEvent ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="p-start">Empieza (hora de Puerto Rico)</Label>
            <Input
              id="p-start"
              type="datetime-local"
              value={v.startsAt}
              onChange={set("startsAt")}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-end">Termina (opcional)</Label>
            <Input id="p-end" type="datetime-local" value={v.endsAt} onChange={set("endsAt")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-loc">Lugar (opcional)</Label>
            <Input id="p-loc" value={v.location} onChange={set("location")} maxLength={200} />
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="p-until">Mostrar hasta (opcional)</Label>
          <Input id="p-until" type="date" value={v.visibleUntil} onChange={set("visibleUntil")} />
          <p className="text-muted-foreground text-xs">Después de ese día deja de verse solo.</p>
        </div>
      )}
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="p-body">Descripción</Label>
        <Textarea id="p-body" rows={5} value={v.body} onChange={set("body")} maxLength={5000} />
      </div>
      <MediaField
        label="Foto (opcional)"
        media={media}
        value={v.mediaId}
        onChange={(id) => setV({ ...v, mediaId: id })}
      />
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-link">Enlace (opcional)</Label>
          <Input id="p-link" value={v.linkUrl} onChange={set("linkUrl")} placeholder="https://…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-label">Texto del botón</Label>
          <Input
            id="p-label"
            value={v.linkLabel}
            onChange={set("linkLabel")}
            placeholder="Inscríbete"
            maxLength={60}
          />
        </div>
      </div>
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
          {pending ? "Guardando…" : post ? "Guardar" : "Crear"}
        </Button>
        {post ? (
          confirmDelete ? (
            <>
              <Button type="button" variant="destructive" onClick={() => void remove()}>
                Sí, borrar
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
              Borrar
            </Button>
          )
        ) : null}
      </div>
    </form>
  );
}
