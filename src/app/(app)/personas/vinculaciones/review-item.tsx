"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { matchLevelLabel } from "@/components/people/match-list";
import type { IdentityReviewItem } from "@/types/database";
import { resolveIdentityReviewAction } from "../registry-actions";

const outcomeLabel: Record<string, string> = {
  sin_coincidencia: "No se encontró un registro que concuerde",
  ambigua: "Varios registros concuerdan",
  sin_correo: "El registro no tiene correo para enviar el código",
  ya_vinculada: "El registro ya tenía otra cuenta",
  codigo_enviado: "Se envió un código y no se completó",
};

export function ReviewItem({ item }: { item: IdentityReviewItem }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function resolve(target: string | null) {
    setError(null);
    start(async () => {
      const res = await resolveIdentityReviewAction(item.request_id, target, note);
      if (!res.ok) setError(res.error);
      else setDone(target ? "Cuenta vinculada." : "Solicitud descartada.");
    });
  }

  if (done) return <p className="text-state-active px-4 py-3 text-sm">{done}</p>;

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="space-y-1">
        <p className="font-medium">
          {item.person_name} <span className="text-muted-foreground">· {item.account_email}</span>
        </p>
        <p className="text-muted-foreground text-sm">
          Pedida {item.created_at.slice(0, 10)}
          {item.submitted.phone ? ` · Tel. ${item.submitted.phone}` : ""}
          {item.submitted.birth_date ? ` · Nac. ${item.submitted.birth_date}` : ""}
          {item.last_outcome ? ` · ${outcomeLabel[item.last_outcome] ?? item.last_outcome}` : ""}
        </p>
        {item.submitted.note ? <p className="text-sm">“{item.submitted.note}”</p> : null}
      </div>

      <div className="max-w-md space-y-1.5">
        <Label htmlFor={`note-${item.request_id}`}>Cómo se verificó *</Label>
        <Input
          id={`note-${item.request_id}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Por ejemplo: confirmado en persona con identificación"
        />
      </div>

      {item.candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hay registros que concuerden. Búscala en Personas; si no existe, descarta la solicitud.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {item.candidates.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/personas/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <StatusBadge tone={c.level === "confiable" ? "warning" : "neutral"}>
                    {matchLevelLabel[c.level]}
                  </StatusBadge>
                  {c.has_account ? <StatusBadge tone="error">Ya tiene cuenta</StatusBadge> : null}
                </div>
                <p className="text-muted-foreground break-all">
                  {c.reasons.join(" · ")}
                  {[c.email, c.phone, c.birth_date].filter(Boolean).length
                    ? ` — ${[c.email, c.phone, c.birth_date].filter(Boolean).join(" · ")}`
                    : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || c.has_account || note.trim().length < 5}
                onClick={() => resolve(c.id)}
              >
                Vincular con este registro
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending || note.trim().length < 5}
        onClick={() => resolve(null)}
      >
        Descartar (no se vincula)
      </Button>
    </div>
  );
}
