import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getMyEnrollments, getMyPerson, getMyPrayerRequests } from "@/lib/data/portal";
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

  const [person, enrollments, prayerRequests] = await Promise.all([
    getMyPerson(user.personId),
    getMyEnrollments(user.personId),
    getMyPrayerRequests(user.userId),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi portal</h1>
        <p className="text-muted-foreground">Tu información, tus cursos y tus peticiones.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mi código de check-in</CardTitle>
        </CardHeader>
        <CardContent>
          <MyQrCode />
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
