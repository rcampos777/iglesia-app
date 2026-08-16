"use client";

import { useActionState } from "react";
import { createServiceAction } from "./actions";
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

const initialState: ActionResult = { ok: true, data: undefined };

const typeOptions = [
  { value: "culto_general", label: "Culto general" },
  { value: "oracion", label: "Oración" },
  { value: "jovenes", label: "Jóvenes" },
  { value: "ninos", label: "Niños" },
  { value: "otro", label: "Otro" },
];

export function NewServiceForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => createServiceAction(formData),
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
        <Label htmlFor="name">Nombre *</Label>
        <Input id="name" name="name" placeholder="Culto dominical" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="serviceDate">Fecha *</Label>
          <Input
            id="serviceDate"
            name="serviceDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="startTime">Hora</Label>
          <Input id="startTime" name="startTime" type="time" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="serviceType">Tipo</Label>
        <Select name="serviceType" defaultValue="culto_general">
          <SelectTrigger id="serviceType" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Lugar</Label>
        <Input id="location" name="location" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear servicio"}
      </Button>
    </form>
  );
}
