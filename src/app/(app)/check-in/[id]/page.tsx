import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getService, listServiceCheckins } from "@/lib/data/checkin";
import { listPeople } from "@/lib/data/people";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { ScanForm } from "./scan-form";
import { ManualCheckinForm } from "./manual-checkin-form";

const CHECKIN_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export default async function ServiceCheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...CHECKIN_ROLES])) redirect("/dashboard");

  const service = await getService(id);
  if (!service) notFound();

  const [checkins, peopleResult] = await Promise.all([
    listServiceCheckins(id),
    listPeople({ limit: 300 }),
  ]);

  const checkedInIds = new Set(checkins.map((c) => c.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{service.name}</h1>
        <p className="text-muted-foreground">
          {new Date(service.service_date + "T00:00:00").toLocaleDateString("es")} ·{" "}
          {checkins.length} check-ins
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Escanear código QR</CardTitle>
          </CardHeader>
          <CardContent>
            <ScanForm serviceId={service.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Check-in manual</CardTitle>
          </CardHeader>
          <CardContent>
            <ManualCheckinForm serviceId={service.id} people={peopleResult.people} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asistentes ({checkins.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {checkedInIds.size === 0 && (
            <p className="text-muted-foreground">Todavía no hay check-ins.</p>
          )}
          {checkins.map((c) => (
            <div key={c.id} className="flex items-center justify-between border-b py-2 text-sm">
              <span>
                {c.personFirstName} {c.personLastName}
              </span>
              <span className="text-muted-foreground">
                {new Date(c.checkedInAt).toLocaleTimeString("es")} · {c.method}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
