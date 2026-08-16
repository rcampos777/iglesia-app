"use client";

import { useActionState } from "react";
import { addClassSessionAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function AddSessionForm({ offeringId }: { offeringId: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => addClassSessionAction(offeringId, formData),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
      {!state.ok && (
        <Alert variant="destructive" className="sm:hidden">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Input name="sessionDate" type="date" required className="sm:w-48" />
      <Input name="topic" placeholder="Tema (opcional)" className="sm:flex-1" />
      <Button type="submit" disabled={isPending} className="shrink-0">
        {isPending ? "Agregando..." : "Agregar sesión"}
      </Button>
    </form>
  );
}
