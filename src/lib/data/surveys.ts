import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SurveyQuestionRow, SurveyRow } from "@/types/database";

export async function listSurveys(): Promise<SurveyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("surveys")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface SurveyWithQuestions {
  survey: SurveyRow;
  questions: SurveyQuestionRow[];
}

export async function getSurveyWithQuestions(id: string): Promise<SurveyWithQuestions | null> {
  const supabase = await createClient();

  const { data: survey, error } = await supabase
    .from("surveys")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!survey) return null;

  const { data: questions } = await supabase
    .from("survey_questions")
    .select("*")
    .eq("survey_id", id)
    .order("order_index");

  return { survey, questions: questions ?? [] };
}

export async function getMyResponseId(
  surveyId: string,
  personId: string | null,
): Promise<string | null> {
  if (!personId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("survey_responses")
    .select("id")
    .eq("survey_id", surveyId)
    .eq("person_id", personId)
    .maybeSingle();
  return data?.id ?? null;
}

export interface QuestionResults {
  question: SurveyQuestionRow;
  totalAnswers: number;
  optionCounts: Record<string, number>;
  textAnswers: string[];
}

export async function getSurveyResults(surveyId: string): Promise<{
  responseCount: number;
  questions: QuestionResults[];
}> {
  const supabase = await createClient();

  const [{ data: questions }, { data: responses }] = await Promise.all([
    supabase.from("survey_questions").select("*").eq("survey_id", surveyId).order("order_index"),
    supabase.from("survey_responses").select("id").eq("survey_id", surveyId),
  ]);

  const responseIds = (responses ?? []).map((r) => r.id);

  const { data: answers } = responseIds.length
    ? await supabase.from("survey_answers").select("*").in("response_id", responseIds)
    : { data: [] };

  const results: QuestionResults[] = (questions ?? []).map((q) => {
    const questionAnswers = (answers ?? []).filter((a) => a.question_id === q.id);
    const optionCounts: Record<string, number> = {};
    const textAnswers: string[] = [];

    for (const a of questionAnswers) {
      if (a.answer_text) textAnswers.push(a.answer_text);
      const opts = a.answer_options;
      if (Array.isArray(opts)) {
        for (const opt of opts) {
          const key = String(opt);
          optionCounts[key] = (optionCounts[key] ?? 0) + 1;
        }
      }
    }

    return { question: q, totalAnswers: questionAnswers.length, optionCounts, textAnswers };
  });

  return { responseCount: (responses ?? []).length, questions: results };
}
