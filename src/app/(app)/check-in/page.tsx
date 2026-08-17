import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listServices } from "@/lib/data/checkin";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { NewServiceForm } from "./new-service-form";
import { CheckinToggle } from "./checkin-toggle";
import { EntranceQr } from "./entrance-qr";

const CHECKIN_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

const typeLabels: Record<string, string> = {
  culto_general: "Culto general",
  oracion: "Oración",
  jovenes: "Jóvenes",
  ninos: "Niños",
  otro: "Otro",
};

export default async function CheckinPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...CHECKIN_ROLES])) redirect("/dashboard");

  const services = await listServices();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check-in de servicios</h1>
        <p className="text-muted-foreground">
          La gente escanea el QR fijo de la entrada y confirma su propia asistencia. También puedes
          escanear el QR personal de alguien o buscarlo manualmente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="size-5" />
            QR fijo para la entrada
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EntranceQr />
        </CardContent>
      </Card>

      <details className="rounded-md border p-4">
        <summary className="cursor-pointer font-medium">
          <span className="inline-flex items-center gap-2">
            <Plus className="size-4" /> Nuevo servicio
          </span>
        </summary>
        <div className="mt-4">
          <NewServiceForm />
        </div>
      </details>

      <div className="space-y-2">
        {services.length === 0 && (
          <p className="text-muted-foreground">No hay servicios creados.</p>
        )}
        {services.map((s) => (
          <Card key={s.id} className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center justify-between gap-3 py-4">
              <Link href={`/check-in/${s.id}`} className="min-w-0 flex-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-muted-foreground text-sm">
                  {new Date(s.service_date + "T00:00:00").toLocaleDateString("es")}
                  {s.start_time ? ` · ${s.start_time}` : ""}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-3">
                <Badge variant="outline">{typeLabels[s.service_type]}</Badge>
                <CheckinToggle serviceId={s.id} isOpen={s.is_checkin_open} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
