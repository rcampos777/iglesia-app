"use client";

import { useActionState } from "react";
import { createSurveyAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MAX_QUESTIONS } from "@/lib/validations/surveys";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function NewSurveyForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => createSurveyAction(formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>

      <div className="space-y-4">
        <h2 className="text-muted-foreground text-sm font-medium">Preguntas</h2>
        {Array.from({ length: MAX_QUESTIONS }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-md border p-3">
            <Input name={`question-${i}-text`} placeholder={`Pregunta ${i + 1}`} />
            <div className="grid grid-cols-2 gap-2">
              <Select name={`question-${i}-type`} defaultValue="texto">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="texto">Texto libre</SelectItem>
                  <SelectItem value="opcion_unica">Opción única</SelectItem>
                </SelectContent>
              </Select>
              <Input
                name={`question-${i}-options`}
                placeholder="Opciones separadas por coma (si aplica)"
              />
            </div>
          </div>
        ))}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creando..." : "Crear encuesta"}
      </Button>
    </form>
  );
}
