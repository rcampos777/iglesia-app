"use client";

import { useRef, useState, useTransition } from "react";
import { scanCheckinAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ScanForm({ serviceId }: { serviceId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = inputRef.current?.value.trim();
    if (!token) return;

    startTransition(async () => {
      const result = await scanCheckinAction(serviceId, token);
      if (result.ok) {
        setMessage({ type: "ok", text: "Check-in registrado." });
      } else {
        setMessage({ type: "error", text: result.error });
      }
      if (inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      <p className="text-muted-foreground text-sm">
        Enfoca aquí y escanea con un lector de código de barras/QR, o pega el código.
      </p>
      <Input ref={inputRef} placeholder="Código escaneado" autoFocus disabled={isPending} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Procesando..." : "Registrar"}
      </Button>
    </form>
  );
}
