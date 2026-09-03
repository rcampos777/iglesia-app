import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getMyEnrollments, getMyPerson, getMyPrayerRequests } from "@/lib/data/portal";
import { listMinistriesForPerson } from "@/lib/data/ministries";
import { listActivitiesForPerson } from "@/lib/data/activities";
import { activityStatusLabels, ministryMemberRoleLabels } from "@/lib/labels";
import { ContactForm } from "./contact-form";
import { PrayerRequestForm } from "./prayer-request-form";
import { MyQrCode } from "./my-qr-code";

const prayerStatusLabels: Record<string, string> = {
  nueva: "Nueva",
  en_oracion: "En oración",
  respondida: "Respondida",
  cerrada: "Cerrada",
};

export default async function PortalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.personId) redirect("/dashboard");

  const [person, enrollments, prayerRequests, ministries, activities] = await Promise.all([
    getMyPerson(user.personId),
    getMyEnrollments(user.personId),
    getMyPrayerRequests(user.userId),
    listMinistriesForPerson(user.personId),
    listActivitiesForPerson(user.personId),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi portal</h1>
        <p className="text-muted-foreground">Tu información, tus cursos y tus peticiones.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Check-in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild variant="outline" className="w-full">
            <Link href="/check-in/publico">Confirmar mi asistencia a un servicio abierto</Link>
          </Button>
          <div className="border-t pt-4">
            <p className="text-muted-foreground mb-2 text-sm">
              O muestra este código para que alguien del equipo te registre:
            </p>
            <MyQrCode />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mi información de contacto</CardTitle>
        </CardHeader>
        <CardContent>{person && <ContactForm person={person} />}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Donde sirvo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ministries.length === 0 && (
            <p className="text-muted-foreground">
              Todavía no sirves en ningún ministerio. Si te interesa servir, habla con un
              coordinador o con tu pastor.
            </p>
          )}
          {ministries.map((m) => (
            <div key={m.id} className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">{m.ministryName}</p>
                <p className="text-muted-foreground text-sm">Desde {m.joined_at}</p>
              </div>
              <Badge variant="outline">{ministryMemberRoleLabels[m.role_in_ministry]}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mis actividades</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activities.length === 0 && (
            <p className="text-muted-foreground">No estás inscrito en ninguna actividad todavía.</p>
          )}
          {activities.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">{a.activityName}</p>
                <p className="text-muted-foreground text-sm">
                  {a.activityDate}
                  {a.activityLocation ? ` · ${a.activityLocation}` : ""}
                </p>
              </div>
              <Badge variant="outline">
                {a.attended ? "Asististe" : activityStatusLabels[a.activityStatus]}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mis cursos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {enrollments.length === 0 && (
            <p className="text-muted-foreground">No estás matriculado en ningún curso todavía.</p>
          )}
          {enrollments.map((e) => (
            <div key={e.enrollmentId} className="flex items-center justify-between border-b pb-2">
              <div>
                <p className="font-medium">{e.classLabel}</p>
                <p className="text-muted-foreground text-sm">{e.courseName}</p>
              </div>
              <Badge variant="outline">{e.attendancePercent}% asistencia</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Peticiones de oración</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PrayerRequestForm />
          <div className="space-y-2">
            {prayerRequests.map((p) => (
              <div key={p.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{prayerStatusLabels[p.status]}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {new Date(p.created_at).toLocaleDateString("es")}
                  </span>
                </div>
                <p className="mt-2 text-sm">{p.content}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
