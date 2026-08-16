import { z } from "zod";

export const surveyQuestionTypeValues = [
  "texto",
  "opcion_unica",
  "opcion_multiple",
  "escala",
] as const;

export const surveySchema = z.object({
  title: z.string().trim().min(1, "El título es requerido.").max(150),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});
export type SurveyInput = z.infer<typeof surveySchema>;

export const MAX_QUESTIONS = 8;
