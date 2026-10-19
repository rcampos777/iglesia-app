"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { formatCents } from "@/lib/money";
import type { ImportProblemRow } from "@/lib/data/finance-import";
import { resolveRepeatsAction } from "@/app/(app)/finanzas/importar/actions";

function rowName(raw: Record<string, string>): string {
  const key = Object.keys(raw).find((k) => /^(nombre|donante|miembro)/i.test(k.trim()));
  return (key && raw[key]) || "Sin nombre";
}

/** Filas que no se importaron (con su motivo) y las que parecen ya registradas. */
export function ProblemRows({
  batchId,
  editable,
  rows,
}: {
  batchId: string;
  editable: boolean;
  rows: ImportProblemRow[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (rows.length === 0) return null;
  const repeats = rows.filter((r) => r.status === "posible_repetida");

  async function resolve(rowId: string | null, include: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await resolveRepeatsAction(batchId, rowId, include);
      if (!res.ok) setError(res.error);
      router.refresh();
    } catch {
      setError("No se pudo guardar. Revisa la conexión.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Filas para revisar</h2>
          <p className="text-muted-foreground text-sm">
            El número de fila es el de tu archivo. Las que tienen error no se importan: corrígelas
            en Registrar o súbelas en otro archivo.
          </p>
        </div>
        {editable && repeats.length > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => resolve(null, false)}
            disabled={pending}
          >
            Omitir las {repeats.length} ya registradas
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="divide-y text-sm">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium">
                Fila {r.row_number} · {rowName(r.raw)}
                {r.amount_cents ? ` · ${formatCents(r.amount_cents)}` : ""}
                {r.donation_date ? ` · ${r.donation_date}` : ""}
              </p>
              <p className="text-muted-foreground">{r.status_detail}</p>
            </div>
            {r.status === "posible_repetida" ? (
              editable ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => resolve(r.id, true)}
                    disabled={pending}
                  >
                    Importar igual
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => resolve(r.id, false)}
                    disabled={pending}
                  >
                    Omitir
                  </Button>
                </div>
              ) : (
                <StatusBadge tone="warning">Ya registrada</StatusBadge>
              )
            ) : (
              <StatusBadge tone="neutral">No importada</StatusBadge>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
