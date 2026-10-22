"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setContactStatusAction } from "./actions";

export function ContactStatusButton({ id, status }: { id: string; status: "nuevo" | "atendido" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = status === "nuevo" ? "atendido" : "nuevo";
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant={status === "nuevo" ? "default" : "outline"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await setContactStatusAction({ id, status: next });
            setError(res.ok ? null : res.error);
          })
        }
      >
        {pending ? "Guardando…" : status === "nuevo" ? "Marcar atendido" : "Marcar como nuevo"}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
