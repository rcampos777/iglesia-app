"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mergeFieldLabels } from "@/lib/people/merge-labels";
import { mergePeopleAction } from "../../registry-actions";

export function MergeForm({
  survivorId,
  mergedId,
  conflicts,
}: {
  survivorId: string;
  mergedId: string;
  conflicts: { field: string; survivor: string; merged: string }[];
}) {
  const router = useRouter();
  const [take, setTake] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(field: string, fromMerged: boolean) {
    setTake((t) => {
      const n = new Set(t);
      if (fromMerged) n.add(field);
      else n.delete(field);
      return n;
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await mergePeopleAction({
        survivorId,
        mergedId,
        reason,
        takeFromMerged: [...take],
      });
      if (!res.ok) setError(res.error);
      else router.push(`/personas/${res.data.survivorId}`);
    });
  }

  return (
    <div className="space-y-5">
      {conflicts.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="font-medium">Campos en conflicto: elige qué valor queda</legend>
          {conflicts.map((c) => (
            <div key={c.field} className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">{mergeFieldLabels[c.field] ?? c.field}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`f-${c.field}`}
                    checked={!take.has(c.field)}
                    onChange={() => toggle(c.field, false)}
                    className="mt-1"
                  />
                  <span className="break-all">{c.survivor} (registro que queda)</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`f-${c.field}`}
                    checked={take.has(c.field)}
                    onChange={() => toggle(c.field, true)}
                    className="mt-1"
                  />
                  <span className="break-all">{c.merged} (registro que se une)</span>
                </label>
              </div>
            </div>
          ))}
        </fieldset>
      ) : (
        <p className="text-muted-foreground text-sm">
          No hay datos en conflicto. Los campos vacíos del registro que queda se completan con los
          del otro.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="merge-reason">Motivo *</Label>
        <Textarea
          id="merge-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Por ejemplo: mismo teléfono y fecha de nacimiento; confirmado con la persona."
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" onClick={submit} disabled={pending || reason.trim().length < 5}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Unificar registros
      </Button>
    </div>
  );
}
