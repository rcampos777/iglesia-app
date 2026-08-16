import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFollowUp } from "@/lib/data/visitors";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { StatusSelector } from "./status-selector";
import { NoteForm } from "./note-form";

const FOLLOWUP_ROLES = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "seguimiento",
] as const;

export default async function FollowUpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...FOLLOWUP_ROLES])) redirect("/visitantes");

  const detail = await getFollowUp(id);
  if (!detail) notFound();

  const { followUp, notes } = detail;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Link href={`/personas/${followUp.person_id}`} className="hover:underline">
              {followUp.personFirstName} {followUp.personLastName}
            </Link>
          </h1>
          <p className="text-muted-foreground">
            {followUp.personPhone || followUp.personEmail || "sin contacto"}
          </p>
        </div>
        <StatusSelector followUpId={followUp.id} currentStatus={followUp.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agregar nota de contacto</CardTitle>
        </CardHeader>
        <CardContent>
          <NoteForm followUpId={followUp.id} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Historial</h2>
        {notes.length === 0 && (
          <p className="text-muted-foreground">Todavía no hay notas de contacto.</p>
        )}
        {notes.map((n) => (
          <Card key={n.id}>
            <CardContent className="py-3">
              <p className="text-sm">{n.note}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {n.contact_method ? `${n.contact_method} · ` : ""}
                {new Date(n.contacted_at).toLocaleString("es")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
