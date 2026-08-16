import { notFound, redirect } from "next/navigation";
import { getImportBatchWithRows } from "@/lib/data/import";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { RowReviewCard } from "./row-review-card";

const IMPORT_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

const matchStatusLabels: Record<string, string> = {
  nuevo: "Nuevo",
  posible_duplicado: "Posible duplicado",
  duplicado_confirmado: "Duplicado confirmado",
  invalido: "Inválido",
};

export default async function ImportBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...IMPORT_ROLES])) redirect("/dashboard");

  const result = await getImportBatchWithRows(id);
  if (!result) notFound();

  const { batch, rows } = result;
  const pending = rows.filter((r) => r.decision === "pendiente").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{batch.file_name || "Lote"}</h1>
        <p className="text-muted-foreground">
          {rows.length} filas · {pending} pendientes de revisión
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <RowReviewCard
            key={row.id}
            row={row}
            batchId={batch.id}
            matchStatusLabel={matchStatusLabels[row.match_status] ?? row.match_status}
          />
        ))}
      </div>
    </div>
  );
}
