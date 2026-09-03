import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { listPrayerRequests } from "@/lib/data/prayer";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { PrayerStatus } from "@/types/database";

/**
 * Quién lee peticiones de oración ya NO es una lista fija de roles: es
 * `is_prayer_reader()` en la base (rol intercesor, administrador, o
 * líder del ministerio de intercesión). Ver 0020_prayer_access_scope.sql.
 */

const statusLabels: Record<string, string> = {
  nueva: "Nueva",
  en_oracion: "En oración",
  respondida: "Respondida",
  cerrada: "Cerrada",
};

export default async function PrayerInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: canRead } = await supabase.rpc("is_prayer_reader");
  if (!canRead) redirect("/dashboard");

  const params = await searchParams;
  const status = (params.status as PrayerStatus | "todas" | undefined) ?? "todas";
  const requests = await listPrayerRequests({ status });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Peticiones de oración</h1>
        <p className="text-muted-foreground">
          {requests.length} peticiones. El contenido solo se muestra al abrir el detalle (acceso
          auditado).
        </p>
      </div>

      <form method="get" className="flex gap-3">
        <Select name="status" defaultValue={status}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {Object.entries(statusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <div className="space-y-2">
        {requests.length === 0 && <p className="text-muted-foreground">No hay peticiones.</p>}
        {requests.map((r) => (
          <Link key={r.id} href={`/oracion/${r.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">{r.requesterName ?? "Anónimo"}</p>
                  <p className="text-muted-foreground text-sm">
                    {new Date(r.created_at).toLocaleDateString("es")}
                    {r.category ? ` · ${r.category}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.urgency === "urgente" && <Badge variant="destructive">Urgente</Badge>}
                  <Badge variant="outline">{statusLabels[r.status]}</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
