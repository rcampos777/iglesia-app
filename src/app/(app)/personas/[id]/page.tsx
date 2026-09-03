import { notFound } from "next/navigation";
import { PersonForm } from "@/components/people/person-form";
import { SendEmailForm } from "@/components/people/send-email-form";
import { updatePersonAction } from "../actions";
import { getPerson } from "@/lib/data/people";
import { listMinistriesForPerson } from "@/lib/data/ministries";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { membershipStatusLabels, ministryMemberRoleLabels } from "@/lib/labels";
import Link from "next/link";

const WRITE_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, person, ministries] = await Promise.all([
    getCurrentUser(),
    getPerson(id),
    listMinistriesForPerson(id),
  ]);

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

      {ministries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sirve en</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {ministries.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/ministerios/${m.ministry_id}`}
                    className="font-medium hover:underline"
                  >
                    {m.ministryName}
                  </Link>
                  <span className="text-muted-foreground">
                    {ministryMemberRoleLabels[m.role_in_ministry]} · desde {m.joined_at}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
