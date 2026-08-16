"use client";

import { useActionState } from "react";
import { createClassOfferingAction } from "../../actions";
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
import { classStatusValues } from "@/lib/validations/courses";
import type { ActionResult } from "@/lib/action-result";
import type { CourseRow, PersonRow } from "@/types/database";

const initialState: ActionResult = { ok: true, data: undefined };

const statusLabels: Record<string, string> = {
  planificada: "Planificada",
  activa: "Activa",
  completada: "Completada",
  cancelada: "Cancelada",
};

export function NewClassOfferingForm({
  courses,
  people,
}: {
  courses: CourseRow[];
  people: PersonRow[];
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => createClassOfferingAction(formData),
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
        <Label htmlFor="courseId">Curso *</Label>
        <Select name="courseId" required>
          <SelectTrigger id="courseId" className="w-full">
            <SelectValue placeholder="Selecciona un curso" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="label">Nombre de la clase *</Label>
        <Input id="label" name="label" placeholder="Ej. Discipulado I — Ciclo 2026" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="teacherPersonId">Maestro</Label>
        <Select name="teacherPersonId">
          <SelectTrigger id="teacherPersonId" className="w-full">
            <SelectValue placeholder="Sin asignar" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="startDate">Fecha de inicio</Label>
          <Input id="startDate" name="startDate" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Fecha de fin</Label>
          <Input id="endDate" name="endDate" type="date" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scheduleText">Horario</Label>
        <Input id="scheduleText" name="scheduleText" placeholder="Ej. Domingos 9:00am" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Lugar</Label>
        <Input id="location" name="location" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="capacity">Cupo</Label>
          <Input id="capacity" name="capacity" type="number" min={1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Estatus</Label>
          <Select name="status" defaultValue="planificada">
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {classStatusValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear clase"}
      </Button>
    </form>
  );
}
