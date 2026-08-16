"use client";

import { useActionState } from "react";
import { createFollowUpAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function NewFollowUpForm({ people }: { people: PersonRow[] }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => createFollowUpAction(formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="personId">Persona *</Label>
        <Select name="personId" required>
          <SelectTrigger id="personId" className="w-full">
            <SelectValue placeholder="Selecciona una persona" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {people.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No hay personas con estatus &quot;visitante&quot; en el directorio todavía.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="firstVisitDate">Fecha de primera visita</Label>
        <Input id="firstVisitDate" name="firstVisitDate" type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dueDate">Fecha límite de seguimiento</Label>
        <Input id="dueDate" name="dueDate" type="date" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear seguimiento"}
      </Button>
    </form>
  );
}
