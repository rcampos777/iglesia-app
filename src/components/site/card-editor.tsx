"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { MediaField, MediaThumb } from "@/components/site/media-picker";
import type { SiteMediaRow } from "@/types/database";
import { deleteCardAction, saveCardAction } from "@/app/(app)/sitio-web/actions";

export type CardItem = {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  media_id: string | null;
  sort_order: number;
  published: boolean;
};

type Labels = { noun: string; subtitle?: string; description: string };

function CardForm({
  table,
  item,
  media,
  labels,
  onDone,
}: {
  table: "site_ministries" | "site_team";
  item?: CardItem;
  media: SiteMediaRow[];
  labels: Labels;
  onDone: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState({
    name: item?.name ?? "",
    subtitle: item?.subtitle ?? "",
    description: item?.description ?? "",
    mediaId: item?.media_id ?? null,
    sortOrder: String(item?.sort_order ?? 0),
    published: item?.published ?? true,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await saveCardAction(table, {
        id: item?.id ?? null,
        ...v,
        mediaId: v.mediaId ?? "",
      });
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
      <div className="space-y-1.5">
        <Label htmlFor={`c-name-${item?.id ?? "n"}`}>Nombre</Label>
        <Input
          id={`c-name-${item?.id ?? "n"}`}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          required
          maxLength={120}
        />
      </div>
      {labels.subtitle ? (
        <div className="space-y-1.5">
          <Label htmlFor={`c-sub-${item?.id ?? "n"}`}>{labels.subtitle}</Label>
          <Input
            id={`c-sub-${item?.id ?? "n"}`}
            value={v.subtitle}
            onChange={(e) => setV({ ...v, subtitle: e.target.value })}
            maxLength={120}
          />
        </div>
      ) : null}
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`c-desc-${item?.id ?? "n"}`}>{labels.description}</Label>
        <Textarea
          id={`c-desc-${item?.id ?? "n"}`}
          rows={3}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          maxLength={2000}
        />
      </div>
      <MediaField
        label="Foto"
        media={media}
        value={v.mediaId}
        onChange={(id) => setV({ ...v, mediaId: id })}
      />
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`c-ord-${item?.id ?? "n"}`}>Orden (menor primero)</Label>
          <Input
            id={`c-ord-${item?.id ?? "n"}`}
            type="number"
            value={v.sortOrder}
            onChange={(e) => setV({ ...v, sortOrder: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={v.published}
            onCheckedChange={(c) => setV({ ...v, published: c === true })}
          />
          Publicado
        </label>
      </div>
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

export function CardEditor({
  table,
  items,
  media,
  labels,
}: {
  table: "site_ministries" | "site_team";
  items: CardItem[];
  media: SiteMediaRow[];
  labels: Labels;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const byId = new Map(media.map((m) => [m.id, m]));
  return (
    <div className="space-y-4">
      <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        {editing === "nuevo" ? (
          <CardForm table={table} media={media} labels={labels} onDone={() => setEditing(null)} />
        ) : (
          <Button onClick={() => setEditing("nuevo")}>Agregar {labels.noun}</Button>
        )}
      </section>
      <ul className="space-y-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="bg-card ring-foreground/10 rounded-xl p-3 shadow-xs ring-1 sm:p-4"
          >
            {editing === it.id ? (
              <CardForm
                table={table}
                item={it}
                media={media}
                labels={labels}
                onDone={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <MediaThumb
                  media={it.media_id ? byId.get(it.media_id) : null}
                  className="size-16 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{it.name}</p>
                  {it.subtitle ? (
                    <p className="text-muted-foreground truncate text-sm">{it.subtitle}</p>
                  ) : null}
                  <StatusBadge tone={it.published ? "active" : "idle"}>
                    {it.published ? "Publicado" : "Borrador"}
                  </StatusBadge>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <Button size="sm" variant="outline" onClick={() => setEditing(it.id)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      if (!window.confirm(`¿Borrar «${it.name}» del sitio?`)) return;
                      const res = await deleteCardAction(table, it.id);
                      if (res.ok) router.refresh();
                    }}
                  >
                    Borrar
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay nada aquí.</p>
      ) : null}
    </div>
  );
}
