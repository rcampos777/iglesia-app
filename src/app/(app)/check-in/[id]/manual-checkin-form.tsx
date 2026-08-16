"use client";

import { useState, useTransition } from "react";
import { manualCheckinAction } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PersonRow } from "@/types/database";

export function ManualCheckinForm({
  serviceId,
  people,
}: {
  serviceId: string;
  people: PersonRow[];
}) {
  const [personId, setPersonId] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function handleClick() {
    if (!personId) return;
    startTransition(async () => {
      const result = await manualCheckinAction(serviceId, personId);
      setMessage(
        result.ok
          ? { type: "ok", text: "Check-in registrado." }
          : { type: "error", text: result.error },
      );
    });
  }

  return (
    <div className="space-y-3">
      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      <Select value={personId} onValueChange={setPersonId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Buscar persona..." />
        </SelectTrigger>
        <SelectContent>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleClick} disabled={isPending || !personId}>
        {isPending ? "Registrando..." : "Registrar check-in"}
      </Button>
    </div>
  );
}
