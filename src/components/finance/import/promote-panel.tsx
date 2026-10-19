"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatCents } from "@/lib/money";
import type { DonationImportSummary } from "@/types/database";
import { discardBatchAction, promoteBatchAction } from "@/app/(app)/finanzas/importar/actions";

export function PromotePanel({
  batchId,
  editable,
  summary,
  unmappedCount,
}: {
  batchId: string;
  editable: boolean;
  summary: DonationImportSummary;
  unmappedCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const blockers: string[] = [];
  if (unmappedCount > 0) blockers.push("asigna los valores sin reconocer");
  if (summary.donors_pending > 0) {
    blockers.push(
      `decide ${summary.donors_pending} ${summary.donors_pending === 1 ? "donante" : "donantes"}`,
    );
  }
  const ready = editable && blockers.length === 0 && summary.pending > 0;

  async function promote() {
    setPending(true);
    setError(null);
    setDone(null);
    try {
      const res = await promoteBatchAction(batchId);
      if (!res.ok) setError(res.error);
      else {
        const r = res.data;
        setDone(
          `Se importaron ${r.imported} donaciones.` +
            (r.review > 0 ? ` ${r.review} parecen ya registradas: revísalas abajo.` : "") +
            (r.skipped > 0 ? ` ${r.skipped} se omitieron.` : ""),
        );
      }
      router.refresh();
    } catch {
      setError(
        "No hubo respuesta del servidor. Recarga la página: lo importado queda guardado y puedes continuar sin duplicar.",
      );
    } finally {
      setPending(false);
    }
  }

  async function discard() {
    setPending(true);
    setError(null);
    try {
      const res = await discardBatchAction(batchId);
      if (!res.ok) setError(res.error);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">
          {editable ? "3. Importar" : "Resultado de la importación"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {editable
            ? `${summary.pending.toLocaleString("es-PR")} filas listas para importar` +
              (summary.with_errors > 0
                ? ` · ${summary.with_errors} con errores no se importan (ver abajo)`
                : "")
            : `${summary.imported.toLocaleString("es-PR")} donaciones importadas por ${formatCents(summary.imported_cents)}.`}
        </p>
      </div>
      {editable && blockers.length > 0 ? (
        <p className="text-state-warning text-sm">Antes de importar: {blockers.join(" y ")}.</p>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="text-state-active text-sm" role="status">
          {done}
        </p>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={promote} disabled={!ready || pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            {pending ? "Importando…" : `Importar ${summary.pending.toLocaleString("es-PR")} filas`}
          </Button>
          {summary.imported === 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  <Trash2 className="size-4" aria-hidden />
                  Descartar archivo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Descartar este archivo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    No se importará nada de este archivo. Puedes subirlo de nuevo cuando quieras.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={discard}>Descartar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
