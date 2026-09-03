"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registerParticipantAction } from "../actions";
import type { ActionResult } from "@/lib/action-result";
import type { PersonPickerOption } from "@/lib/data/ministries";

const initialState: ActionResult = { ok: true, data: undefined };

export function RegisterForm({
  activityId,
  people,
  full,
}: {
  activityId: string;
  people: PersonPickerOption[];
  /** La actividad ya alcanzó su cupo. */
  full: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) =>
      registerParticipantAction(activityId, formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <p className="font-medium">Inscribir persona</p>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {full && (
        <Alert>
          <AlertDescription>
            La actividad alcanzó su cupo. No se pueden inscribir más personas.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
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
              Todas las personas del directorio ya están inscritas.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Nota</Label>
          <Input id="notes" name="notes" maxLength={500} placeholder="Opcional" />
        </div>
      </div>

      <Button type="submit" disabled={isPending || full || people.length === 0}>
        {isPending ? "Inscribiendo..." : "Inscribir"}
      </Button>
    </form>
  );
}
