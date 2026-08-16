"use client";

import { useActionState } from "react";
import { enrollPersonAction } from "../../actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import type { PersonRow } from "@/types/database";

const initialState: ActionResult = { ok: true, data: undefined };

export function EnrollForm({ offeringId, people }: { offeringId: string; people: PersonRow[] }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => enrollPersonAction(offeringId, formData),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
      {!state.ok && (
        <Alert variant="destructive" className="sm:hidden">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Select name="personId" required>
        <SelectTrigger className="w-full sm:flex-1">
          <SelectValue placeholder="Selecciona una persona para matricular" />
        </SelectTrigger>
        <SelectContent>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={isPending} className="shrink-0">
        {isPending ? "Matriculando..." : "Matricular"}
      </Button>
      {!state.ok && (
        <Alert variant="destructive" className="hidden sm:block">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
