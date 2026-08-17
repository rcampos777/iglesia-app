import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { hasCheckedIn, listOpenServices } from "@/lib/data/checkin";
import { ConfirmCheckinButton } from "./confirm-checkin-button";

const typeLabels: Record<string, string> = {
  culto_general: "Culto general",
  oracion: "Oración",
  jovenes: "Jóvenes",
  ninos: "Niños",
  otro: "Otro",
};

export default async function PublicCheckinPage() {
  const user = await getCurrentUser();
  const services = await listOpenServices();

  const servicesWithStatus = await Promise.all(
    services.map(async (s) => ({
      service: s,
      alreadyIn: user?.personId ? await hasCheckedIn(s.id, user.personId) : false,
    })),
  );

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Bienvenido</h1>
        <p className="text-muted-foreground">Confirma tu asistencia al servicio de hoy.</p>
      </div>

      {servicesWithStatus.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            No hay ningún servicio abierto para check-in en este momento. Pregunta al equipo de
            bienvenida.
          </CardContent>
        </Card>
      )}

      {servicesWithStatus.map(({ service, alreadyIn }) => (
        <Card key={service.id}>
          <CardHeader>
            <CardTitle>{service.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              {typeLabels[service.service_type]}
              {service.location ? ` · ${service.location}` : ""}
            </p>
            <ConfirmCheckinButton serviceId={service.id} alreadyCheckedIn={alreadyIn} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
