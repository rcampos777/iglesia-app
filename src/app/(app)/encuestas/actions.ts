"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireAuth, AuthError } from "@/lib/auth/require-role";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { surveySchema, MAX_QUESTIONS } from "@/lib/validations/surveys";
import type { SurveyQuestionType } from "@/types/database";

const SURVEY_MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export async function createSurveyAction(formData: FormData): Promise<ActionResult> {
  const user = await (async () => {
    try {
      return await requireRole([...SURVEY_MANAGE_ROLES]);
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!user) return actionError("No tienes permiso para crear encuestas.");

  const parsed = surveySchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) return actionError("Revisa los datos.");

  const supabase = await createClient();
  const { data: survey, error } = await supabase
    .from("surveys")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      created_by: user.userId,
    })
    .select("id")
    .single();

  if (error || !survey) return actionError(`No se pudo crear la encuesta: ${error?.message}`);

  const questions = [];
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    const text = formData.get(`question-${i}-text`);
    const type = formData.get(`question-${i}-type`);
    const optionsRaw = formData.get(`question-${i}-options`);

    if (typeof text === "string" && text.trim()) {
      const questionType = (type as SurveyQuestionType) || "texto";
      const options =
        questionType === "opcion_unica" && typeof optionsRaw === "string" && optionsRaw.trim()
          ? optionsRaw
              .split(",")
              .map((o) => o.trim())
              .filter(Boolean)
          : null;

      questions.push({
        survey_id: survey.id,
        question_text: text.trim(),
        question_type: questionType,
        options,
        order_index: i,
      });
    }
  }

  if (questions.length > 0) {
    const { error: qError } = await supabase.from("survey_questions").insert(questions);
    if (qError) return actionError(`No se pudieron guardar las preguntas: ${qError.message}`);
  }

  revalidatePath("/encuestas");
  redirect(`/encuestas/${survey.id}`);
}

export async function submitSurveyResponseAction(
  surveyId: string,
  formData: FormData,
): Promise<ActionResult> {
  const user = await (async () => {
    try {
      return await requireAuth();
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  })();
  if (!user) return actionError("Debes iniciar sesión.");

  const supabase = await createClient();

  const { data: response, error: responseError } = await supabase
    .from("survey_responses")
    .insert({ survey_id: surveyId, person_id: user.personId })
    .select("id")
    .single();

  if (responseError || !response) {
    if (responseError?.code === "23505") return actionError("Ya respondiste esta encuesta.");
    return actionError(`No se pudo enviar tu respuesta: ${responseError?.message}`);
  }

  const answers: {
    response_id: string;
    question_id: string;
    answer_text: string | null;
    answer_options: string[] | null;
  }[] = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("answer-") || typeof value !== "string" || !value.trim()) continue;
    const questionId = key.replace("answer-", "");
    answers.push({
      response_id: response.id,
      question_id: questionId,
      answer_text: value,
      answer_options: null,
    });
  }

  if (answers.length > 0) {
    const { error: answersError } = await supabase.from("survey_answers").insert(answers);
    if (answersError)
      return actionError(`No se pudieron guardar tus respuestas: ${answersError.message}`);
  }

  revalidatePath(`/encuestas/${surveyId}`);
  return actionOk(undefined);
}
