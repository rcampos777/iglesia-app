"use client";

import { useActionState, useRef } from "react";
import { submitPrayerRequestAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
    <form ref={formRef} action={formAction} className="space-y-3 border-b pb-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Textarea name="content" placeholder="Escribe tu petición de oración..." rows={3} required />
      <label className="text-muted-foreground flex items-center gap-2 text-sm">
        <Checkbox name="isAnonymous" />
        Enviar de forma anónima
      </label>
      <p className="text-muted-foreground text-xs">
        Solo los intercesores, pastores y administradores pueden ver el contenido de tu petición.
        Nunca se envía por email.
      </p>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar petición"}
      </Button>
    </form>
  );
}
