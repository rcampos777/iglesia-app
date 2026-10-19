import Link from "next/link";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge, type StatusTone } from "@/components/ui-brand/status-badge";
import { requireFinancePage } from "@/lib/finance/guard";
import { listDonationImportBatches } from "@/lib/data/finance-import";
import type { DonationImportBatchStatus } from "@/types/database";
import { UploadDonationsForm } from "./upload-form";

const STATUS: Record<DonationImportBatchStatus, { label: string; tone: StatusTone }> = {
  en_revision: { label: "En revisión", tone: "warning" },
  completado: { label: "Importado", tone: "active" },
  descartado: { label: "Descartado", tone: "neutral" },
};

export default async function DonationImportPage() {
  await requireFinancePage();
  const batches = await listDonationImportBatches();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar donaciones"
        description="Sube el registro de diezmos y ofrendas (Excel o CSV). Nada entra a Donaciones hasta que revises a cada donante."
      />

      <section className="bg-card ring-foreground/10 max-w-2xl space-y-4 rounded-xl p-4 shadow-xs ring-1 sm:p-6">
        <UploadDonationsForm />
        <div className="text-muted-foreground space-y-1 text-sm">
          <p>
            Columnas que se leen: <strong>Fecha</strong>, <strong>Nombre del miembro</strong>,{" "}
            Familia/Grupo, <strong>Categoría</strong>, Subcategoría, <strong>Monto</strong>,{" "}
            <strong>Forma de pago</strong>, Referencia y Observaciones. Las hojas de resumen se
            ignoran.
          </p>
          <p>
            Un mismo nombre en muchas filas es <strong>un solo donante</strong>. Si ya existe en la
            app, se enlaza a esa persona; si no, se crea como donante de Finanzas (no aparece en el
            directorio ni en los reportes).
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Archivos subidos</h2>
        {batches.length === 0 ? (
          <p className="text-muted-foreground text-sm">Todavía no has subido archivos.</p>
        ) : (
          <ul className="bg-card ring-foreground/10 divide-y rounded-xl shadow-xs ring-1">
            {batches.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/finanzas/importar/${b.id}`}
                  className="hover:bg-muted/50 flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.file_name}</span>
                    <span className="text-muted-foreground block text-sm">
                      {new Date(b.created_at).toLocaleDateString("es-PR", {
                        timeZone: "America/Puerto_Rico",
                      })}{" "}
                      · {b.total_rows.toLocaleString("es-PR")} filas ·{" "}
                      {b.imported_count.toLocaleString("es-PR")} importadas
                    </span>
                  </span>
                  <StatusBadge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
