import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { listCourseCategories } from "@/lib/data/courses";
import { NewCourseForm } from "./new-course-form";

const MANAGE_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export default async function NewCoursePage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...MANAGE_ROLES])) redirect("/cursos");

  const categories = await listCourseCategories();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo curso</h1>
        <p className="text-muted-foreground">Agrega un curso al catálogo de una categoría.</p>
      </div>
      <NewCourseForm categories={categories} />
    </div>
  );
}
