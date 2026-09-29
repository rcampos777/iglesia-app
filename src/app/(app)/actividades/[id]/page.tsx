import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { activityTone } from "@/lib/status-tones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getActivityDetail } from "@/lib/data/activities";
import { listMinistries, listPeopleForMinistryPicker } from "@/lib/data/ministries";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, hasRole, isStaff } from "@/lib/auth/session";
import { activityStatusLabels } from "@/lib/labels";
import { ActivityForm } from "../activity-form";
import { ParticipantRow } from "./attendance-toggle";
import { RegisterForm } from "./register-form";
import { RegistrationSettingsForm } from "./registration-settings-form";
import { RegistrationsList } from "./registrations-list";
import { listActivityRegistrations, listSiteMediaOptions } from "@/lib/data/registrations";
import { formatDateKey } from "@/lib/datetime";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!isStaff(user)) redirect("/portal");

  const detail = await getActivityDetail(id);
  if (!detail) notFound();

  const { activity, participants } = detail;

  // Espeja can_manage_activity() de la base: roles globales, o líder del
  // ministerio dueño. El pastor entra solo por la segunda vía.
  const supabase = await createClient();
  const { data: canManage } = await supabase.rpc("can_manage_activity", {
    p_ministry_id: activity.ministry_id,
  });

  // Un pastor que no puede gestionarla tampoco debe verla suelta.
  if (hasRole(user, "pastor") && !hasRole(user, "administrador") && !canManage) {
    redirect("/actividades");
  }

  const full = activity.capacity != null && participants.length >= activity.capacity;

  const [people, ministries, registrations, media] = canManage
    ? await Promise.all([
        listPeopleForMinistryPicker(),
        listMinistries({ includeInactive: true }),
        listActivityRegistrations(activity.id),
        listSiteMediaOptions(),
      ])
    : [[], [], [], []];
  const publicBaseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ciudaddeavivamiento.org";

  const alreadyIn = new Set(participants.map((p) => p.person_id));
  const availablePeople = people.filter((p) => !alreadyIn.has(p.id));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/actividades">
          <ArrowLeft className="size-4" aria-hidden />
          Actividades
        </Link>
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">
            {activity.name}
          </h1>
          <p className="text-muted-foreground">
            {formatDateKey(activity.activity_date)}
            {activity.end_date && activity.end_date !== activity.activity_date
              ? ` al ${formatDateKey(activity.end_date)}`
              : ""}
            {activity.start_time ? ` · ${activity.start_time.slice(0, 5)}` : ""}
            {activity.end_time ? ` a ${activity.end_time.slice(0, 5)}` : ""}
            {activity.location ? ` · ${activity.location}` : ""}
          </p>
        </div>
        <StatusBadge tone={activityTone[activity.status]}>
          {activityStatusLabels[activity.status]}
        </StatusBadge>
      </div>

      <Card>
        <CardContent className="space-y-2 text-sm">
          {activity.description && <p>{activity.description}</p>}
          {activity.ministryName && (
            <p className="text-muted-foreground">Organiza: {activity.ministryName}</p>
          )}
          {activity.responsibleName && (
            <p className="text-muted-foreground">Responsable: {activity.responsibleName}</p>
          )}
          <p className="text-muted-foreground">
            {participants.length} inscritos
            {activity.capacity != null
              ? ` de ${activity.capacity} de cupo`
              : " (sin límite)"} · {activity.attendedCount} asistieron
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inscritos y asistencia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {participants.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nadie inscrito todavía
              {canManage ? ". Inscribe a la primera persona abajo." : "."}
            </p>
          )}

          <div className="divide-y">
            {participants.map((p) => (
              <ParticipantRow
                key={p.id}
                activityId={activity.id}
                participant={p}
                canManage={Boolean(canManage)}
              />
            ))}
          </div>

          {canManage && (
            <>
              <Separator />
              <RegisterForm activityId={activity.id} people={availablePeople} full={full} />
            </>
          )}
        </CardContent>
      </Card>

      {canManage && (activity.registration_slug || registrations.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Inscripciones en línea</CardTitle>
          </CardHeader>
          <CardContent>
            <RegistrationsList
              activityId={activity.id}
              priceCents={activity.price_cents}
              depositCents={activity.deposit_cents}
              registrations={registrations}
            />
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Inscripción en línea (sitio web)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 max-w-2xl text-sm">
              Crea una forma pública para que la gente se inscriba sola. Cada inscrito recibe un
              email de confirmación, los organizadores reciben un aviso, y salen recordatorios
              automáticos de pago (10 días antes) y de la actividad (3 días antes).
            </p>
            <div className="max-w-2xl">
              <RegistrationSettingsForm
                activity={activity}
                media={media}
                publicBaseUrl={publicBaseUrl}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Editar actividad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-2xl">
              <ActivityForm
                people={people}
                ministries={ministries.map((m) => ({ id: m.id, name: m.name }))}
                activity={activity}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
