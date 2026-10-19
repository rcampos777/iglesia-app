"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyMinistryImportAction } from "../../../actions";

export function ApplyButton({
  ministryId,
  batchId,
  ready,
}: {
  ministryId: string;
  batchId: string;
  ready: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply() {
    start(async () => {
      const res = await applyMinistryImportAction(ministryId, batchId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const r = res.data;
      setError(null);
      setMessage(
        [
          `${r.creadas} registradas nuevas`,
          `${r.agregadas} agregadas`,
          `${r.ya_integrantes} ya estaban`,
          `${r.omitidas} omitidas`,
          r.a_revisar > 0
            ? `${r.a_revisar} volvieron a revisión (apareció una coincidencia)`
            : null,
          r.pendientes > 0 ? `${r.pendientes} sin decidir` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={apply} disabled={pending || ready === 0}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Aplicar {ready} {ready === 1 ? "fila decidida" : "filas decididas"}
      </Button>
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
