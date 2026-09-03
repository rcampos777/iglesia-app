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
import { createActivityAction, updateActivityAction } from "./actions";
import { activityStatusLabels } from "@/lib/labels";
import { activityStatusValues, NO_MINISTRY_VALUE } from "@/lib/validations/activities";
import type { ActionResult } from "@/lib/action-result";
import type { PersonPickerOption } from "@/lib/data/ministries";
import type { ActivityRow } from "@/types/database";

const initialState: ActionResult<string | undefined> = { ok: true, data: undefined };

export function ActivityForm({
  people,
  ministries,
  activity,
}: {
  people: PersonPickerOption[];
  ministries: { id: string; name: string }[];
  /** Si viene, el formulario edita; si no, crea. */
  activity?: ActivityRow;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<string | undefined>, formData: FormData) =>
      activity ? updateActivityAction(activity.id, formData) : createActivityAction(formData),
    initialState,
  );

  const saved = state.ok && state.data === "guardado";
  const fieldError = (name: string) =>
    !state.ok && state.fieldErrors?.[name] ? state.fieldErrors[name][0] : null;

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
          maxLength={150}
          defaultValue={activity?.name ?? ""}
          placeholder="Retiro de jóvenes, Jornada de limpieza..."
        />
        {fieldError("name") && <p className="text-destructive text-sm">{fieldError("name")}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={activity?.description ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ministryId">Ministerio organizador</Label>
        <Select name="ministryId" defaultValue={activity?.ministry_id ?? NO_MINISTRY_VALUE}>
          <SelectTrigger id="ministryId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MINISTRY_VALUE}>Actividad general de la iglesia</SelectItem>
            {ministries.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-sm">
          Si la asignas a un ministerio, su líder podrá organizarla por sí mismo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="activityDate">Fecha *</Label>
          <Input
            id="activityDate"
            name="activityDate"
            type="date"
            required
            defaultValue={activity?.activity_date ?? ""}
          />
          {fieldError("activityDate") && (
            <p className="text-destructive text-sm">{fieldError("activityDate")}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="startTime">Hora de inicio</Label>
          <Input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue={activity?.start_time?.slice(0, 5) ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">Hora de fin</Label>
          <Input
            id="endTime"
            name="endTime"
            type="time"
            defaultValue={activity?.end_time?.slice(0, 5) ?? ""}
          />
          {fieldError("endTime") && (
            <p className="text-destructive text-sm">{fieldError("endTime")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="location">Lugar</Label>
          <Input
            id="location"
            name="location"
            maxLength={150}
            defaultValue={activity?.location ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="capacity">Cupo</Label>
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            defaultValue={activity?.capacity ?? ""}
            placeholder="Sin límite"
          />
          {fieldError("capacity") && (
            <p className="text-destructive text-sm">{fieldError("capacity")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="responsiblePersonId">Responsable</Label>
          <Select
            name="responsiblePersonId"
            defaultValue={activity?.responsible_person_id ?? NO_MINISTRY_VALUE}
          >
            <SelectTrigger id="responsiblePersonId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_MINISTRY_VALUE}>Sin responsable asignado</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <Select name="status" defaultValue={activity?.status ?? "planificada"}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activityStatusValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {activityStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : activity ? "Guardar cambios" : "Crear actividad"}
        </Button>
        {saved && <span className="text-muted-foreground text-sm">Cambios guardados.</span>}
      </div>
    </form>
  );
}
