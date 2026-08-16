"use client";

import { useActionState, useRef } from "react";
import { addFollowUpNoteAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function NoteForm({ followUpId }: { followUpId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await addFollowUpNoteAction(followUpId, formData);
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
      <Textarea name="note" placeholder="¿Qué pasó en este contacto?" rows={3} required />
      <Input name="contactMethod" placeholder="Medio de contacto (llamada, visita, WhatsApp...)" />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Agregar nota"}
      </Button>
    </form>
  );
}
