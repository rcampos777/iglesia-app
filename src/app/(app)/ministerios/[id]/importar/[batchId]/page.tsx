import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui-brand/status-badge";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getMinistryImport } from "@/lib/data/person-registry";
import type { MinistryImportResult, MinistryImportRowRow } from "@/types/database";
import { RowDecision } from "./row-decision";
import { ApplyButton } from "./apply-button";

const resultLabel: Record<MinistryImportResult, [string, StatusTone]> = {
  creada: ["Registrada y agregada", "active"],
  agregada: ["Agregada", "active"],
  ya_integrante: ["Ya estaba", "idle"],
  omitida: ["Omitida", "neutral"],
};

function rowState(r: MinistryImportRowRow): [string, StatusTone] {
  if (r.result) return resultLabel[r.result];
  if (r.errors.length > 0) return ["Con error", "error"];
  if (r.decision === "pendiente") return ["Revisar", "warning"];
  if (r.decision === "usar_existente") return ["Ya registrada", "tracking"];
  if (r.decision === "crear") return ["Nueva", "tracking"];
  return ["No se importa", "neutral"];
}

export default async function MinistryImportBatchPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const { id, batchId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: ministry }, data] = await Promise.all([
    supabase.from("ministries").select("id, name").eq("id", id).maybeSingle(),
    getMinistryImport(batchId),
  ]);
  if (!ministry || !data || data.batch.ministry_id !== id) notFound();

  const rows = data.rows;
  const open = rows.filter((r) => !r.processed_at);
  const ready = open.filter((r) => r.decision !== "pendiente").length;
  const toReview = open.filter((r) => r.decision === "pendiente").length;
  const errors = rows.filter((r) => r.errors.length > 0).length;
  const done = rows.length - open.length;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/ministerios/${id}`}>
          <ArrowLeft className="size-4" aria-hidden />
          {ministry.name}
        </Link>
      </Button>
      <PageHeader
        title={`Vista previa: ${data.batch.file_name}`}
        description={`${rows.length} filas · ${done} aplicadas · ${toReview} por revisar · ${errors} con error`}
      />

      <Card>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong>Ya registrada</strong>: se usa el registro que existe (no se duplica).{" "}
            <strong>Revisar</strong>: hay coincidencias posibles; elige si es una de ellas o una
            persona nueva. Las filas con error no se importan: corrige el archivo y vuelve a
            subirlo. Repetir la importación no duplica personas ni integrantes.
          </p>
          {open.length > 0 ? (
            <ApplyButton ministryId={id} batchId={batchId} ready={ready} />
          ) : (
            <p className="text-state-active font-medium">Importación aplicada.</p>
          )}
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {rows.map((r) => {
          const [label, tone] = rowState(r);
          return (
            <li
              key={r.id}
              className="bg-card ring-foreground/10 space-y-2 rounded-xl p-4 shadow-xs ring-1"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-xs">Fila {r.row_number}</span>
                    <span className="font-medium">
                      {`${r.first_name} ${r.last_name}`.trim() || "(sin nombre)"}
                    </span>
                    <StatusBadge tone={tone}>{label}</StatusBadge>
                  </div>
                  <p className="text-muted-foreground text-sm break-all">
                    {[r.email, r.phone, r.birth_date].filter(Boolean).join(" · ") || "Sin contacto"}
                  </p>
                  {r.errors.map((e) => (
                    <p key={e} className="text-destructive text-sm">
                      {e}
                    </p>
                  ))}
                </div>
                {!r.processed_at && r.errors.length === 0 ? (
                  <RowDecision
                    ministryId={id}
                    batchId={batchId}
                    rowId={r.id}
                    decision={r.decision}
                    personId={r.person_id}
                    candidates={r.candidates}
                  />
                ) : null}
              </div>
              {r.candidates.length > 0 && !r.processed_at ? (
                <ul className="text-muted-foreground space-y-1 border-t pt-2 text-sm">
                  {r.candidates.map((c) => (
                    <li key={c.id}>
                      <span className="text-foreground font-medium">{c.name}</span> —{" "}
                      {c.level === "confiable" ? "confiable" : "posible"}: {c.reasons.join(", ")}
                      {c.email_hint ? ` · ${c.email_hint}` : ""}
                      {c.has_account ? " · con cuenta" : " · sin cuenta"}
                      {c.in_ministry ? " · ya está en el ministerio" : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
