"use client";

import { useActionState } from "react";
import { submitSurveyResponseAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import type { SurveyQuestionRow } from "@/types/database";

const initialState: ActionResult = { ok: true, data: undefined };

export function ResponseForm({
  surveyId,
  questions,
}: {
  surveyId: string;
  questions: SurveyQuestionRow[];
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) =>
      submitSurveyResponseAction(surveyId, formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {questions.length === 0 && (
        <p className="text-muted-foreground">Esta encuesta no tiene preguntas todavía.</p>
      )}
      {questions.map((q) => {
        const options = Array.isArray(q.options) ? (q.options as string[]) : [];
        return (
          <div key={q.id} className="space-y-2">
            <Label htmlFor={`answer-${q.id}`}>{q.question_text}</Label>
            {q.question_type === "opcion_unica" && options.length > 0 ? (
              <Select name={`answer-${q.id}`}>
                <SelectTrigger id={`answer-${q.id}`} className="w-full">
                  <SelectValue placeholder="Selecciona una opción" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : q.question_type === "escala" ? (
              <Input id={`answer-${q.id}`} name={`answer-${q.id}`} type="number" min={1} max={10} />
            ) : (
              <Textarea id={`answer-${q.id}`} name={`answer-${q.id}`} rows={2} />
            )}
          </div>
        );
      })}
      <Button type="submit" disabled={isPending || questions.length === 0}>
        {isPending ? "Enviando..." : "Enviar respuesta"}
      </Button>
    </form>
  );
}
