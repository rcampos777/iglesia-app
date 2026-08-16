"use client";

import { useActionState, useRef } from "react";
import { sendPersonEmailAction } from "@/app/(app)/personas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function SendEmailForm({ personId }: { personId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await sendPersonEmailAction(personId, formData);
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
      <Input name="subject" placeholder="Asunto" required />
      <Textarea name="message" placeholder="Mensaje" rows={4} required />
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar email"}
      </Button>
    </form>
  );
}
