"use client";

import { useState, useTransition } from "react";
import { reviewImportRowAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImportRowWithCandidates } from "@/lib/data/import";

export function RowReviewCard({
  row,
  batchId,
  matchStatusLabel,
}: {
  row: ImportRowWithCandidates;
  batchId: string;
  matchStatusLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedCandidate, setSelectedCandidate] = useState<string | undefined>(
    row.candidateNames[0]?.id,
  );
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState(row.decision);

  const normalized = (row.normalized_data ?? {}) as Record<string, string>;
  const errors = (row.validation_errors ?? []) as string[];
  const resolved = decision !== "pendiente";

  function act(kind: "aprobar_nuevo" | "aprobar_fusion" | "rechazar") {
    setError(null);
    startTransition(async () => {
      const result = await reviewImportRowAction(
        row.id,
        batchId,
        kind,
        kind === "aprobar_fusion" ? selectedCandidate : undefined,
      );
      if (!result.ok) setError(result.error);
      else setDecision(kind);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">
              {normalized.first_name} {normalized.last_name}
            </p>
            <p className="text-muted-foreground text-sm">
              {normalized.email || normalized.phone || "sin contacto"}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{matchStatusLabel}</Badge>
            {resolved && <Badge>{decision}</Badge>}
          </div>
        </div>

        {errors.length > 0 && (
          <p className="text-destructive text-sm">Errores: {errors.join(", ")}</p>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        {!resolved && row.match_status !== "invalido" && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            {row.candidateNames.length > 0 && (
              <>
                <Select value={selectedCandidate} onValueChange={setSelectedCandidate}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Elegir persona existente" />
                  </SelectTrigger>
                  <SelectContent>
                    {row.candidateNames.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending || !selectedCandidate}
                  onClick={() => act("aprobar_fusion")}
                >
                  Fusionar
                </Button>
              </>
            )}
            <Button size="sm" disabled={isPending} onClick={() => act("aprobar_nuevo")}>
              Aprobar como nuevo
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => act("rechazar")}>
              Rechazar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
