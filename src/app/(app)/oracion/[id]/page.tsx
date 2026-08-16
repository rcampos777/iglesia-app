import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getPrayerRequestDetail } from "@/lib/data/prayer";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { StatusControls } from "./status-controls";

const PRAYER_ROLES = ["intercesor", "pastor", "administrador"] as const;

export default async function PrayerRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...PRAYER_ROLES])) redirect("/dashboard");

  const request = await getPrayerRequestDetail(id);
  if (!request) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {request.requesterName ?? "Petición anónima"}
          </h1>
          <p className="text-muted-foreground">
            {new Date(request.created_at).toLocaleString("es")}
            {request.category ? ` · ${request.category}` : ""}
          </p>
        </div>
        {request.urgency === "urgente" && <Badge variant="destructive">Urgente</Badge>}
      </div>

      <Card>
        <CardContent className="py-4">
          <p className="whitespace-pre-wrap">{request.content}</p>
        </CardContent>
      </Card>

      <StatusControls
        requestId={request.id}
        currentStatus={request.status}
        assignedToMe={request.assigned_to === user?.userId}
      />

      <p className="text-muted-foreground text-xs">
        Este acceso quedó registrado en la bitácora de auditoría de peticiones de oración.
      </p>
    </div>
  );
}
