import { notFound } from "next/navigation";
import { PersonForm } from "@/components/people/person-form";
import { SendEmailForm } from "@/components/people/send-email-form";
import { updatePersonAction } from "../actions";
import { getActivityName, getPerson } from "@/lib/data/people";
import { getPersonJourney } from "@/lib/data/journey";
import { PersonJourneyCard } from "@/components/people/person-journey";
import { getPortalAccountStatus } from "@/lib/data/portal-invitations";
import { InvitePortalCard } from "@/components/people/invite-portal-card";
import { AccountPermissionsTab } from "@/components/people/account-permissions-tab";
import { getAccountForPerson, getResponsibilitiesForPerson } from "@/lib/data/permissions";
import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole, isAdmin, isStaff } from "@/lib/auth/session";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { membershipTone } from "@/lib/status-tones";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { membershipStatusLabels, personSourceLabels } from "@/lib/labels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const WRITE_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const user = await getCurrentUser();
  if (!isStaff(user)) redirect("/portal");

  const [person, journey] = await Promise.all([getPerson(id), getPersonJourney(id)]);

  if (!person) {
    notFound();
  }

  const sourceActivityName = person.source_activity_id
    ? await getActivityName(person.source_activity_id)
    : null;
  const canWrite = hasAnyRole(user, [...WRITE_ROLES]);
  const userIsAdmin = isAdmin(user);
  const [portalStatus, account, responsibilities] = await Promise.all([
    canWrite ? getPortalAccountStatus(id) : Promise.resolve(null),
    userIsAdmin ? getAccountForPerson(id) : Promise.resolve(null),
    userIsAdmin ? getResponsibilitiesForPerson(id) : Promise.resolve(null),
  ]);

  async function updateThisPerson(formData: FormData) {
    "use server";
    return updatePersonAction(id, formData);
  }

  const defaultTab = tab === "cuenta-permisos" && userIsAdmin ? "cuenta-permisos" : "general";

  const generalContent = (
    <div className="space-y-6">
      {canWrite ? (
        <PersonForm action={updateThisPerson} person={person} submitLabel="Guardar cambios" />
      ) : (
        <p className="text-muted-foreground">
          No tienes permiso para editar este registro. Contacta a un coordinador o administrador.
        </p>
      )}

      {journey && <PersonJourneyCard journey={journey} />}

      {canWrite && portalStatus && (
        <InvitePortalCard
          personId={person.id}
          defaultEmail={person.email}
          hasAccount={portalStatus.hasAccount}
          pendingInvitation={portalStatus.pendingInvitation}
        />
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

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">
            {person.first_name} {person.last_name}
          </h1>
          <p className="text-muted-foreground">
            Registrado el {new Date(person.created_at).toLocaleDateString("es")} ·{" "}
            {sourceActivityName
              ? `Inscripción: ${sourceActivityName}`
              : personSourceLabels[person.source]}
          </p>
        </div>
        <StatusBadge tone={membershipTone[person.membership_status]}>
          {membershipStatusLabels[person.membership_status]}
        </StatusBadge>
      </div>

      {userIsAdmin ? (
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="cuenta-permisos">Cuenta y permisos</TabsTrigger>
          </TabsList>
          <TabsContent value="general">{generalContent}</TabsContent>
          <TabsContent value="cuenta-permisos">
            <AccountPermissionsTab
              personId={person.id}
              account={account}
              responsibilities={responsibilities ?? { ministriesLed: [], classesTaught: [] }}
            />
          </TabsContent>
        </Tabs>
      ) : (
        generalContent
      )}
    </div>
  );
}
