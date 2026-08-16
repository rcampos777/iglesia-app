import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSurveyWithQuestions, getMyResponseId, getSurveyResults } from "@/lib/data/surveys";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { ResponseForm } from "./response-form";

const SURVEY_MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const detail = await getSurveyWithQuestions(id);
  if (!detail) notFound();

  const canManage = hasAnyRole(user, [...SURVEY_MANAGE_ROLES]);
  const { survey, questions } = detail;

  if (canManage) {
    const results = await getSurveyResults(id);
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{survey.title}</h1>
          <p className="text-muted-foreground">{results.responseCount} respuestas</p>
        </div>
        {results.questions.map((q) => (
          <Card key={q.question.id}>
            <CardHeader>
              <CardTitle className="text-base">{q.question.question_text}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.keys(q.optionCounts).length > 0 &&
                Object.entries(q.optionCounts).map(([option, count]) => (
                  <div key={option} className="flex items-center justify-between text-sm">
                    <span>{option}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              {q.textAnswers.length > 0 && (
                <div className="space-y-1">
                  {q.textAnswers.map((a, i) => (
                    <p key={i} className="bg-muted rounded-md p-2 text-sm">
                      {a}
                    </p>
                  ))}
                </div>
              )}
              {q.totalAnswers === 0 && (
                <p className="text-muted-foreground text-sm">Sin respuestas todavía.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const myResponseId = await getMyResponseId(id, user?.personId ?? null);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{survey.title}</h1>
        {survey.description && <p className="text-muted-foreground">{survey.description}</p>}
      </div>

      {myResponseId ? (
        <p className="text-muted-foreground">Ya respondiste esta encuesta. ¡Gracias!</p>
      ) : (
        <ResponseForm surveyId={survey.id} questions={questions} />
      )}
    </div>
  );
}
