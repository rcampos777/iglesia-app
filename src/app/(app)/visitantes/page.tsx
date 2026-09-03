import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { followupTone } from "@/lib/status-tones";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listFollowUps } from "@/lib/data/visitors";
import { followupStatusLabels } from "@/lib/labels";
import { followupStatusValues } from "@/lib/validations/visitors";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import type { FollowupStatus } from "@/types/database";

const FOLLOWUP_ROLES = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "seguimiento",
] as const;

export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...FOLLOWUP_ROLES])) redirect("/dashboard");

  const params = await searchParams;
  const status = (params.status as FollowupStatus | "todos" | undefined) ?? "todos";
  const followUps = await listFollowUps({ status });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visitantes y seguimiento</h1>
          <p className="text-muted-foreground">{followUps.length} seguimientos.</p>
        </div>
        <Button asChild>
          <Link href="/visitantes/nuevo">
            <Plus className="mr-2 size-4" />
            Nuevo seguimiento
          </Link>
        </Button>
      </div>

      <form method="get" className="flex gap-3">
        <Select name="status" defaultValue={status}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estatus</SelectItem>
            {followupStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                {followupStatusLabels[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <div className="space-y-2">
        {followUps.length === 0 && (
          <p className="text-muted-foreground">No hay seguimientos con este filtro.</p>
        )}
        {followUps.map((f) => (
          <Link key={f.id} href={`/visitantes/${f.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="font-medium">
                    {f.personFirstName} {f.personLastName}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {f.personPhone || f.personEmail || "sin contacto"}
                  </p>
                </div>
                <StatusBadge tone={followupTone[f.status]}>
                  {followupStatusLabels[f.status]}
                </StatusBadge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
