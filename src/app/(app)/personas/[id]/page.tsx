import { notFound } from "next/navigation";
import { PersonForm } from "@/components/people/person-form";
import { SendEmailForm } from "@/components/people/send-email-form";
import { updatePersonAction } from "../actions";
import { getPerson } from "@/lib/data/people";
import { getPersonJourney } from "@/lib/data/journey";
import { PersonJourneyCard } from "@/components/people/person-journey";
import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole, isStaff } from "@/lib/auth/session";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { membershipTone } from "@/lib/status-tones";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { membershipStatusLabels } from "@/lib/labels";

const WRITE_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isStaff(user)) redirect("/portal");

  const [person, journey] = await Promise.all([getPerson(id), getPersonJourney(id)]);

  if (!person) {
    notFound();
  }

  const canWrite = hasAnyRole(user, [...WRITE_ROLES]);

  async function updateThisPerson(formData: FormData) {
    "use server";
    return updatePersonAction(id, formData);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {person.first_name} {person.last_name}
          </h1>
          <p className="text-muted-foreground">
            Registrado el {new Date(person.created_at).toLocaleDateString("es")}
          </p>
        </div>
        <StatusBadge tone={membershipTone[person.membership_status]}>
          {membershipStatusLabels[person.membership_status]}
        </StatusBadge>
      </div>

      {canWrite ? (
        <PersonForm action={updateThisPerson} person={person} submitLabel="Guardar cambios" />
      ) : (
        <p className="text-muted-foreground">
          No tienes permiso para editar este registro. Contacta a un coordinador o administrador.
        </p>
      )}

      {journey && <PersonJourneyCard journey={journey} />}

      {canWrite && person.email && (
        <Card>
          <CardHeader>
            <CardTitle>Enviar email</CardTitle>
          </CardHeader>
          <CardContent>
            <SendEmailForm personId={person.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
