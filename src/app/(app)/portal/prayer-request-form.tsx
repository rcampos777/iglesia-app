"use client";

import { useActionState, useRef } from "react";
import { submitPrayerRequestAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function PrayerRequestForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await submitPrayerRequestAction(formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    initialState,
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="prayer-content">Nueva petición</Label>
        <Textarea
          id="prayer-content"
          name="content"
          placeholder="Escribe por qué quieres que oremos…"
          rows={3}
          required
          aria-describedby="prayer-privacy"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isAnonymous" />
        Enviar de forma anónima
      </label>
      <p id="prayer-privacy" className="text-muted-foreground text-sm">
        Solo el equipo de intercesión y la administración pueden leer tu petición. Nunca se envía
        por email.
      </p>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar petición"}
      </Button>
    </form>
  );
}
