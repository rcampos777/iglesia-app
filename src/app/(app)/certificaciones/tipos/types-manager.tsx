"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createCertificationTypeAction, setCertificationTypeActiveAction } from "../actions";

type TypeItem = { id: string; name: string; description: string | null; active: boolean };

export function TypesManager({ types }: { types: TypeItem[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "No se pudo guardar.");
      else router.refresh();
      return res.ok;
    } catch {
      setError("No hubo respuesta del servidor. Revisa la conexión.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run("new", () => createCertificationTypeAction({ name, description }));
    if (ok) {
      setName("");
      setDescription("");
    }
  }

  return (
    <div className="space-y-6">
      <ul className="bg-card ring-foreground/10 divide-y rounded-xl shadow-xs ring-1">
        {types.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className={t.active ? "font-medium" : "text-muted-foreground font-medium"}>
                {t.name}
              </p>
              {t.description ? (
                <p className="text-muted-foreground text-sm">{t.description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Label htmlFor={`type-${t.id}`} className="text-muted-foreground text-sm">
                {t.active ? "En uso" : "Desactivado"}
              </Label>
              <Switch
                id={`type-${t.id}`}
                checked={t.active}
                disabled={busy !== null}
                onCheckedChange={(v) =>
                  void run(t.id, () => setCertificationTypeActiveAction(t.id, v))
                }
              />
            </div>
          </li>
        ))}
      </ul>

      <form
        onSubmit={add}
        className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 shadow-xs ring-1 sm:p-5"
      >
        <h2 className="font-semibold">Añadir tipo</h2>
        <div className="space-y-1.5">
          <Label htmlFor="type-name">Nombre</Label>
          <Input
            id="type-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Ej.: Certificado de salud"
            disabled={busy !== null}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type-description">Descripción (opcional)</Label>
          <Input
            id="type-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            disabled={busy !== null}
          />
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy !== null}>
          {busy === "new" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Añadir
        </Button>
      </form>
    </div>
  );
}
