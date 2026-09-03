import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listMinistries } from "@/lib/data/ministries";
import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole, isStaff } from "@/lib/auth/session";

const MINISTRY_ADMIN_ROLES = ["administrador", "pastor", "coordinador_ministerio"] as const;

export default async function MinistriesPage({
  searchParams,
}: {
  searchParams: Promise<{ inactivos?: string }>;
}) {
  const user = await getCurrentUser();
  // El catálogo completo es para staff. Un miembro ve en /portal los
  // ministerios donde sirve.
  if (!isStaff(user)) redirect("/portal");

  const canManage = hasAnyRole(user, [...MINISTRY_ADMIN_ROLES]);

  const params = await searchParams;
  const includeInactive = params.inactivos === "1";
  const ministries = await listMinistries({ includeInactive });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ministerios</h1>
          <p className="text-muted-foreground">
            {ministries.length} {ministries.length === 1 ? "ministerio" : "ministerios"}
            {includeInactive ? " (incluye inactivos)." : " activos."}
          </p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/ministerios/nuevo">
              <Plus className="mr-2 size-4" />
              Nuevo ministerio
            </Link>
          </Button>
        )}
      </div>

      <Button asChild variant="secondary" size="sm">
        <Link href={includeInactive ? "/ministerios" : "/ministerios?inactivos=1"}>
          {includeInactive ? "Ver solo activos" : "Incluir inactivos"}
        </Link>
      </Button>

      <div className="grid gap-3 sm:grid-cols-2">
        {ministries.length === 0 && (
          <p className="text-muted-foreground">
            Todavía no hay ministerios registrados
            {canManage ? ". Crea el primero con el botón de arriba." : "."}
          </p>
        )}
        {ministries.map((m) => (
          <Link key={m.id} href={`/ministerios/${m.id}`} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{m.name}</p>
                  {!m.is_active && <Badge variant="outline">Inactivo</Badge>}
                </div>
                {m.description && (
                  <p className="text-muted-foreground line-clamp-2 text-sm">{m.description}</p>
                )}
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1">
                    <Users className="size-4" aria-hidden="true" />
                    {m.activeMemberCount} sirviendo
                  </span>
                  {m.leaderName && <span>Líder: {m.leaderName}</span>}
                  {m.meeting_schedule_text && <span>{m.meeting_schedule_text}</span>}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
