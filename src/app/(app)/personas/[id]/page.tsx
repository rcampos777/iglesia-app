import { notFound } from "next/navigation";
import { PersonForm } from "@/components/people/person-form";
import { updatePersonAction } from "../actions";
import { getPerson } from "@/lib/data/people";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { membershipStatusLabels } from "@/lib/labels";

const WRITE_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, person] = await Promise.all([getCurrentUser(), getPerson(id)]);

  if (!person) {
    notFound();
  }

  const canWrite = hasAnyRole(user, [...WRITE_ROLES]);

  async function updateThisPerson(formData: FormData) {
    "use server";
    return updatePersonAction(id, formData);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {person.first_name} {person.last_name}
          </h1>
          <p className="text-muted-foreground">
            Registrado el {new Date(person.created_at).toLocaleDateString("es")}
          </p>
        </div>
        <Badge variant="outline">{membershipStatusLabels[person.membership_status]}</Badge>
      </div>

      {canWrite ? (
        <PersonForm action={updateThisPerson} person={person} submitLabel="Guardar cambios" />
      ) : (
        <p className="text-muted-foreground">
          No tienes permiso para editar este registro. Contacta a un coordinador o administrador.
        </p>
      )}
    </div>
  );
}
