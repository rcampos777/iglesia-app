import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getMinistryDetail, listPeopleForMinistryPicker } from "@/lib/data/ministries";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { ministryMemberRoleLabels } from "@/lib/labels";
import { MinistryForm } from "../ministry-form";
import { AddMemberForm } from "./add-member-form";
import { MemberRow } from "./member-row";

const MINISTRY_ADMIN_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export default async function MinistryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getMinistryDetail(id);
  if (!detail) notFound();

  const { ministry, activeMembers, formerMembers } = detail;
  const user = await getCurrentUser();

  const isAdmin = hasAnyRole(user, [...MINISTRY_ADMIN_ROLES]);
  // El líder del ministerio gestiona su propia gente sin ser staff global.
  const isLeader =
    (user?.personId != null && ministry.leader_person_id === user.personId) ||
    activeMembers.some(
      (m) =>
        m.person_id === user?.personId &&
        (m.role_in_ministry === "lider" || m.role_in_ministry === "colider"),
    );
  const canManageMembers = isAdmin || isLeader;

  const people = canManageMembers ? await listPeopleForMinistryPicker() : [];
  const alreadyServing = new Set(activeMembers.map((m) => m.person_id));
  const availablePeople = people.filter((p) => !alreadyServing.has(p.id));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/ministerios">
          <ArrowLeft className="mr-2 size-4" />
          Ministerios
        </Link>
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ministry.name}</h1>
          <p className="text-muted-foreground">
            {ministry.activeMemberCount}{" "}
            {ministry.activeMemberCount === 1 ? "persona sirviendo" : "personas sirviendo"}
            {ministry.leaderName ? ` · Líder: ${ministry.leaderName}` : ""}
          </p>
        </div>
        {!ministry.is_active && <Badge variant="outline">Inactivo</Badge>}
      </div>

      {(ministry.description || ministry.meeting_schedule_text || ministry.location) && (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            {ministry.description && <p>{ministry.description}</p>}
            {ministry.meeting_schedule_text && (
              <p className="text-muted-foreground">Reunión: {ministry.meeting_schedule_text}</p>
            )}
            {ministry.location && (
              <p className="text-muted-foreground">Lugar: {ministry.location}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quiénes sirven</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeMembers.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {canManageMembers
                ? "Nadie registrado todavía. Agrega a la primera persona abajo."
                : "No hay información de membresía disponible para tu rol."}
            </p>
          )}

          <div className="divide-y">
            {activeMembers.map((m) => (
              <MemberRow
                key={m.id}
                ministryId={ministry.id}
                member={m}
                canManage={canManageMembers}
              />
            ))}
          </div>

          {canManageMembers && (
            <>
              <Separator />
              <AddMemberForm ministryId={ministry.id} people={availablePeople} />
            </>
          )}
        </CardContent>
      </Card>

      {formerMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sirvieron antes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted-foreground space-y-1 text-sm">
              {formerMembers.map((m) => (
                <li key={m.id}>
                  {m.personFirstName} {m.personLastName} —{" "}
                  {ministryMemberRoleLabels[m.role_in_ministry]} (hasta {m.left_at})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Editar ministerio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-lg">
              <MinistryForm people={people} ministry={ministry} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
