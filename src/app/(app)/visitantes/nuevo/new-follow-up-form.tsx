"use client";

import { useActionState, useState } from "react";
import { X } from "lucide-react";
import { createFollowUpAction } from "../actions";
import { quickRegisterPersonAction } from "@/app/(app)/personas/registry-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PersonResolver } from "@/components/people/person-resolver";
import { toMatchItem } from "@/components/people/match-list";
import { actionOk, type ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

/**
 * Paso 1: quién visitó (persona existente o nueva, sin duplicar). Paso 2:
 * datos del seguimiento. Para una visita basta el nombre.
 */
export function NewFollowUpForm() {
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => createFollowUpAction(formData),
    initialState,
  );

  if (!person) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Escribe los datos que tengas. Antes de crear a alguien nuevo revisamos si ya está
          registrado (por ejemplo, si ya tiene cuenta o sirve en un ministerio).
        </p>
        <PersonResolver
          createLabel="Continuar"
          existingLabel="Elegir"
          submitNew={async (input, ack, key) => {
            const res = await quickRegisterPersonAction("visita", input, ack, key);
            if (!res.ok) return res;
            if (res.data.status === "matches") {
              return actionOk({
                status: "matches" as const,
                matches: res.data.matches.map(toMatchItem),
              });
            }
            setPerson({ id: res.data.personId, name: res.data.name });
            return actionOk({ status: "done" as const });
          }}
          chooseExisting={async (m) => {
            setPerson({ id: m.id, name: m.name });
            return actionOk(undefined);
          }}
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="personId" value={person.id} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Persona</p>
        <div className="bg-muted/50 flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="min-w-0 truncate font-medium">{person.name}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPerson(null)}>
            <X className="size-4" aria-hidden />
            Cambiar
          </Button>
        </div>
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
