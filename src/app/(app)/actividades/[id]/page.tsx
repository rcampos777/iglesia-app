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

  const [people, ministries] = canManage
    ? await Promise.all([listPeopleForMinistryPicker(), listMinistries({ includeInactive: true })])
    : [[], []];

  const alreadyIn = new Set(participants.map((p) => p.person_id));
  const availablePeople = people.filter((p) => !alreadyIn.has(p.id));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/actividades">
          <ArrowLeft className="mr-2 size-4" />
          Actividades
        </Link>
      </Button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{activity.name}</h1>
          <p className="text-muted-foreground">
            {activity.activity_date}
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
        <CardContent className="space-y-2 py-4 text-sm">
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
