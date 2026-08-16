"use client";

import { useActionState, useState } from "react";
import { updateOwnContactAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import type { PersonRow } from "@/types/database";

const initialState: ActionResult = { ok: true, data: undefined };

export function ContactForm({ person }: { person: PersonRow }) {
  const [justSaved, setJustSaved] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await updateOwnContactAction(formData);
      setJustSaved(result.ok);
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && justSaved && (
        <Alert>
          <AlertDescription>Guardado.</AlertDescription>
        </Alert>
      )}
      <p className="text-muted-foreground text-sm">
        {person.first_name} {person.last_name} — para cambiar tu nombre, contacta a un
        administrador.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="preferredName">Nombre preferido</Label>
          <Input
            id="preferredName"
            name="preferredName"
            defaultValue={person.preferred_name ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" defaultValue={person.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={person.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Ciudad</Label>
          <Input id="city" name="city" defaultValue={person.city ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="addressLine">Dirección</Label>
          <Input id="addressLine" name="addressLine" defaultValue={person.address_line ?? ""} />
        </div>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
