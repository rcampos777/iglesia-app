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
import { addMinistryMemberAction } from "../actions";
import { ministryMemberRoleLabels } from "@/lib/labels";
import { ministryMemberRoleValues } from "@/lib/validations/ministries";
import type { ActionResult } from "@/lib/action-result";
import type { PersonRow } from "@/types/database";

const initialState: ActionResult = { ok: true, data: undefined };

export function AddMemberForm({ ministryId, people }: { ministryId: string; people: PersonRow[] }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) =>
      addMinistryMemberAction(ministryId, formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <p className="font-medium">Agregar persona al ministerio</p>

      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
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
              Todas las personas del directorio ya sirven aquí.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleInMinistry">Responsabilidad *</Label>
          <Select name="roleInMinistry" defaultValue="miembro">
            <SelectTrigger id="roleInMinistry" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ministryMemberRoleValues.map((r) => (
                <SelectItem key={r} value={r}>
                  {ministryMemberRoleLabels[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="joinedAt">Sirve desde</Label>
          <Input id="joinedAt" name="joinedAt" type="date" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Nota</Label>
          <Input id="notes" name="notes" maxLength={500} placeholder="Opcional" />
        </div>
      </div>

      <Button type="submit" disabled={isPending || people.length === 0}>
        {isPending ? "Agregando..." : "Agregar al ministerio"}
      </Button>
    </form>
  );
}
