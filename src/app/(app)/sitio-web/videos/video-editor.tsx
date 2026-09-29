"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import type { SiteVideoRow } from "@/types/database";
import { deleteVideoAction, saveVideoAction } from "../actions";

function VideoForm({ video, onDone }: { video?: SiteVideoRow; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    title: video?.title ?? "",
    url: video ? `https://youtu.be/${video.youtube_id}` : "",
    description: video?.description ?? "",
    recordedOn: video?.recorded_on ?? "",
    featured: video?.featured ?? false,
    published: video?.published ?? true,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await saveVideoAction({ id: video?.id ?? null, ...v });
      if (res.ok) {
        router.refresh();
        onDone();
      } else setError(res.error);
    } catch {
      setError("No hubo respuesta del servidor.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="v-url">Enlace de YouTube</Label>
        <Input
          id="v-url"
          value={v.url}
          onChange={(e) => setV({ ...v, url: e.target.value })}
          placeholder="https://www.youtube.com/watch?v=…"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="v-title">Título</Label>
        <Input
          id="v-title"
          value={v.title}
          onChange={(e) => setV({ ...v, title: e.target.value })}
          required
          maxLength={150}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="v-date">Fecha de la predicación (opcional)</Label>
        <Input
          id="v-date"
          type="date"
          value={v.recordedOn}
          onChange={(e) => setV({ ...v, recordedOn: e.target.value })}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="v-desc">Descripción (opcional)</Label>
        <Textarea
          id="v-desc"
          rows={2}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={v.featured}
          onCheckedChange={(c) => setV({ ...v, featured: c === true })}
        />
        Destacado (sale primero en la portada)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={v.published}
          onCheckedChange={(c) => setV({ ...v, published: c === true })}
        />
        Publicado
      </label>
      {error ? (
        <p className="text-destructive text-sm sm:col-span-2" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function VideoEditor({ videos }: { videos: SiteVideoRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "nuevo" | null>(null);
  return (
    <div className="space-y-4">
      <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        {editing === "nuevo" ? (
          <VideoForm onDone={() => setEditing(null)} />
        ) : (
          <Button onClick={() => setEditing("nuevo")}>Agregar video de YouTube</Button>
        )}
      </section>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((vid) => (
          <li
            key={vid.id}
            className="bg-card ring-foreground/10 space-y-2 rounded-xl p-3 shadow-xs ring-1"
          >
            {editing === vid.id ? (
              <VideoForm video={vid} onDone={() => setEditing(null)} />
            ) : (
              <>
                <div className="relative aspect-video overflow-hidden rounded-md bg-black">
                  <Image
                    src={`https://i.ytimg.com/vi/${vid.youtube_id}/hqdefault.jpg`}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <p className="font-medium">{vid.title}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={vid.published ? "active" : "idle"}>
                    {vid.published ? "Publicado" : "Borrador"}
                  </StatusBadge>
                  {vid.featured ? <StatusBadge tone="tracking">Destacado</StatusBadge> : null}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(vid.id)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      if (!window.confirm(`¿Borrar «${vid.title}» del sitio?`)) return;
                      const res = await deleteVideoAction(vid.id);
                      if (res.ok) router.refresh();
                    }}
                  >
                    Borrar
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {videos.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay videos.</p>
      ) : null}
    </div>
  );
}
