"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MinistryImportCandidate, MinistryImportDecision } from "@/types/database";
import { decideMinistryImportRowAction } from "../../../actions";

const NEW = "__crear";
const SKIP = "__omitir";
const PENDING = "__pendiente";

/** Decisión por fila: una coincidencia mostrada, crear nueva u omitir. */
export function RowDecision({
  ministryId,
  batchId,
  rowId,
  decision,
  personId,
  candidates,
}: {
  ministryId: string;
  batchId: string;
  rowId: string;
  decision: MinistryImportDecision;
  personId: string | null;
  candidates: MinistryImportCandidate[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const value =
    decision === "usar_existente" && personId
      ? personId
      : decision === "crear"
        ? NEW
        : decision === "omitir"
          ? SKIP
          : PENDING;

  function change(v: string) {
    const [d, p]: [MinistryImportDecision, string | null] =
      v === NEW
        ? ["crear", null]
        : v === SKIP
          ? ["omitir", null]
          : v === PENDING
            ? ["pendiente", null]
            : ["usar_existente", v];
    start(async () => {
      const res = await decideMinistryImportRowAction(ministryId, batchId, rowId, d, p);
      setError(res.ok ? null : res.error);
    });
  }

  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={change} disabled={pending}>
        <SelectTrigger className="w-full sm:w-64" aria-label="Qué hacer con esta fila">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PENDING}>Sin decidir</SelectItem>
          {candidates.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              Es {c.name}
              {c.in_ministry ? " (ya está)" : ""}
            </SelectItem>
          ))}
          <SelectItem value={NEW}>Crear persona nueva</SelectItem>
          <SelectItem value={SKIP}>No importar</SelectItem>
        </SelectContent>
      </Select>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
