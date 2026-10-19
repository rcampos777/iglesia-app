import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { requireFinancePage } from "@/lib/finance/guard";
import {
  getDonationImportBatch,
  getDonationImportDonors,
  getDonationImportProblemRows,
  getDonationImportSummary,
  getDonationImportUnmapped,
} from "@/lib/data/finance-import";
import { formatCents } from "@/lib/money";
import { ValueMapper } from "@/components/finance/import/value-mapper";
import { DonorReview } from "@/components/finance/import/donor-review";
import { PromotePanel } from "@/components/finance/import/promote-panel";
import { ProblemRows } from "@/components/finance/import/problem-rows";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DonationImportBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFinancePage();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const batch = await getDonationImportBatch(id);
  if (!batch) notFound();
  const [summary, donors, unmapped, problems] = await Promise.all([
    getDonationImportSummary(id),
    getDonationImportDonors(id),
    getDonationImportUnmapped(id),
    getDonationImportProblemRows(id),
  ]);
  const editable = batch.status === "en_revision";

  const stats = [
    { label: "Filas", value: summary.rows.toLocaleString("es-PR") },
    { label: "Donantes", value: summary.donors.toLocaleString("es-PR") },
    { label: "Total válido", value: formatCents(summary.valid_cents) },
    { label: "Importadas", value: summary.imported.toLocaleString("es-PR") },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/finanzas/importar">
          <ArrowLeft className="size-4" aria-hidden />
          Importar
        </Link>
      </Button>
      <PageHeader
        title={batch.file_name}
        description="Revisa a quién pertenece cada nombre y luego importa. Nada se envía por email."
        actions={
          batch.status === "completado" ? (
            <StatusBadge tone="active">Importado</StatusBadge>
          ) : batch.status === "descartado" ? (
            <StatusBadge tone="neutral">Descartado</StatusBadge>
          ) : (
            <StatusBadge tone="warning">En revisión</StatusBadge>
          )
        }
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-card ring-foreground/10 rounded-xl p-3 shadow-xs ring-1 sm:p-4"
          >
            <dt className="text-muted-foreground text-sm">{s.label}</dt>
            <dd className="text-lg font-semibold tabular-nums sm:text-xl">{s.value}</dd>
          </div>
        ))}
      </dl>

      {editable && unmapped.length > 0 ? <ValueMapper batchId={id} values={unmapped} /> : null}

      {editable || summary.imported > 0 ? (
        <PromotePanel
          batchId={id}
          editable={editable}
          summary={summary}
          unmappedCount={unmapped.length}
        />
      ) : null}

      <DonorReview batchId={id} editable={editable} donors={donors} summary={summary} />

      <ProblemRows batchId={id} editable={editable} rows={problems} />
    </div>
  );
}
