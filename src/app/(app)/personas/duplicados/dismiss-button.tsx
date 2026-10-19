"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { dismissDuplicateAction } from "../registry-actions";

export function DismissButton({ a, b }: { a: string; b: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await dismissDuplicateAction(a, b, "Revisado: personas distintas");
            setError(res.ok ? null : res.error);
          })
        }
      >
        No son la misma persona
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
