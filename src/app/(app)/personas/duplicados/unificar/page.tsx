import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { getMergePreview } from "@/lib/data/person-registry";
import { membershipStatusLabels, personSourceLabels } from "@/lib/labels";
import { relationLabels } from "@/lib/people/merge-labels";
import type { MergePreviewPerson } from "@/types/database";
import { MergeForm } from "./merge-form";

function PersonSummary({ title, p }: { title: string; p: MergePreviewPerson }) {
  const rel = Object.entries(p.relations);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {title}
          <StatusBadge tone={p.has_account ? "active" : "idle"}>
            {p.has_account ? "Con cuenta" : "Sin cuenta"}
          </StatusBadge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-base font-medium">
            {p.first_name} {p.last_name}
          </p>
          <p className="text-muted-foreground break-all">
            {[p.email, p.phone, p.birth_date].filter(Boolean).join(" · ") || "Sin contacto"}
          </p>
          <p className="text-muted-foreground">
            {membershipStatusLabels[p.membership_status]} · {personSourceLabels[p.source]} ·
            registrado {p.created_at.slice(0, 10)}
          </p>
        </div>
        <div>
          <p className="font-medium">Relaciones</p>
          {rel.length === 0 ? (
            <p className="text-muted-foreground">Ninguna.</p>
          ) : (
            <ul className="text-muted-foreground">
              {rel.map(([k, n]) => (
                <li key={k}>
                  {relationLabels[k] ?? k}: {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MergePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/personas/duplicados");
  const { a, b } = await searchParams;
  const ids = z.tuple([z.string().uuid(), z.string().uuid()]).safeParse([a, b]);
  if (!ids.success) notFound();
  const [survivorId, mergedId] = ids.data;
  const preview = await getMergePreview(survivorId, mergedId);
  if (!preview) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/personas/duplicados">
          <ArrowLeft className="size-4" aria-hidden />
          Posibles duplicados
        </Link>
      </Button>
      <PageHeader
        title="Unificar registros"
        description="Todo el historial del registro que se une pasa al que queda. Se guarda quién lo hizo, cuándo y el id anterior; los enlaces viejos llevan al registro que queda."
        actions={
          <Button asChild variant="outline">
            <Link href={`/personas/duplicados/unificar?a=${mergedId}&b=${survivorId}`}>
              <ArrowLeftRight className="size-4" aria-hidden />
              Cambiar cuál queda
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <PersonSummary title="Registro que queda" p={preview.survivor} />
        <PersonSummary title="Registro que se une (desaparece)" p={preview.merged} />
      </div>

      <Card>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <p>
            Se trasladan visitas, ministerios, cursos, actividades, asistencia, peticiones y demás
            relaciones. Lo repetido se combina sin perder datos: un ministerio en los dos queda una
            vez (fecha más antigua y responsabilidad mayor); una asistencia repetida se anula con
            motivo, no se borra.
          </p>
          {preview.shared_ministries.length > 0 ? (
            <p>Ministerios en los dos: {preview.shared_ministries.join(", ")}.</p>
          ) : null}
          <p>
            {preview.finance_detail_visible
              ? "Las donaciones cambian solo de persona (importe, fecha, tipo y recibo quedan igual, con revisión) y las cartas del período quedan para revisión."
              : "Si hay registros financieros, cambian solo de persona (importes, fechas y recibos quedan igual) y Finanzas lo ve en su historial. Su detalle solo lo ve Finanzas."}
          </p>
        </CardContent>
      </Card>

      {preview.blocked ? (
        <Alert variant="destructive">
          <AlertTitle>No se puede unificar</AlertTitle>
          <AlertDescription>{preview.blocked}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <MergeForm survivorId={survivorId} mergedId={mergedId} conflicts={preview.conflicts} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
