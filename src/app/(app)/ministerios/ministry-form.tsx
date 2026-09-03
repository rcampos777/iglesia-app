"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createMinistryAction, updateMinistryAction } from "./actions";
import { NO_LEADER_VALUE } from "@/lib/validations/ministries";
import type { ActionResult } from "@/lib/action-result";
import type { PersonPickerOption } from "@/lib/data/ministries";
import type { MinistryRow } from "@/types/database";

const initialState: ActionResult<string | undefined> = { ok: true, data: undefined };

export function MinistryForm({
  people,
  ministry,
  canDesignatePrayerMinistry = false,
}: {
  people: PersonPickerOption[];
  /** Solo un administrador puede designar el ministerio de intercesión. */
  canDesignatePrayerMinistry?: boolean;
  /** Si viene, el formulario edita; si no, crea. */
  ministry?: MinistryRow;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<string | undefined>, formData: FormData) =>
      ministry ? updateMinistryAction(ministry.id, formData) : createMinistryAction(formData),
    initialState,
  );

  const saved = state.ok && state.data === "guardado";

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={ministry?.name ?? ""}
          placeholder="Alabanza, Ujieres, Niños..."
        />
        {!state.ok && state.fieldErrors?.name && (
          <p className="text-destructive text-sm">{state.fieldErrors.name[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={1000}
          rows={3}
          defaultValue={ministry?.description ?? ""}
          placeholder="Propósito del ministerio, a quién sirve..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="leaderPersonId">Líder</Label>
        <Select name="leaderPersonId" defaultValue={ministry?.leader_person_id ?? NO_LEADER_VALUE}>
          <SelectTrigger id="leaderPersonId" className="w-full">
            <SelectValue placeholder="Sin líder asignado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_LEADER_VALUE}>Sin líder asignado</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-sm">
          El líder puede gestionar por sí mismo a quién sirve en este ministerio.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="meetingScheduleText">Horario de reunión</Label>
        <Input
          id="meetingScheduleText"
          name="meetingScheduleText"
          maxLength={150}
          defaultValue={ministry?.meeting_schedule_text ?? ""}
          placeholder="Sábados 4:00 p.m."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="location">Lugar</Label>
        <Input
          id="location"
          name="location"
          maxLength={150}
          defaultValue={ministry?.location ?? ""}
          placeholder="Salón principal"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="isActive">Estado</Label>
        <Select name="isActive" defaultValue={ministry ? String(ministry.is_active) : "true"}>
          <SelectTrigger id="isActive" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Activo</SelectItem>
            <SelectItem value="false">Inactivo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {canDesignatePrayerMinistry && (
        <div className="space-y-2">
          <Label htmlFor="grantsPrayerAccess">Acceso a peticiones de oración</Label>
          <Select
            name="grantsPrayerAccess"
            defaultValue={ministry ? String(ministry.grants_prayer_access) : "false"}
          >
            <SelectTrigger id="grantsPrayerAccess" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="false">No</SelectItem>
              <SelectItem value="true">Sí — este es el ministerio de intercesión</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-sm">
            Si lo marcas, los líderes de este ministerio podrán leer las peticiones de oración
            aunque no tengan el rol de intercesor. Solo un ministerio puede tener esta marca.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : ministry ? "Guardar cambios" : "Crear ministerio"}
        </Button>
        {saved && <span className="text-muted-foreground text-sm">Cambios guardados.</span>}
      </div>
    </form>
  );
}
