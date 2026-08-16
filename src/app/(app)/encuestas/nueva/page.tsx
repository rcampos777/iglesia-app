import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { NewSurveyForm } from "./new-survey-form";

const SURVEY_MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export default async function NewSurveyPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...SURVEY_MANAGE_ROLES])) redirect("/encuestas");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva encuesta</h1>
        <p className="text-muted-foreground">
          Agrega hasta 8 preguntas. Deja en blanco las que no uses.
        </p>
      </div>
      <NewSurveyForm />
    </div>
  );
}
