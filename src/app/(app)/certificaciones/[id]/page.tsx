import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { CertificationForm } from "@/components/certifications/certification-form";
import { requireFinancePage } from "@/lib/finance/guard";
import { isApostol } from "@/lib/auth/finance";
import { getCertification, listCertificationTypes } from "@/lib/data/certifications";
import {
  certificationStatus,
  certificationStatusLabels,
  certificationStatusTone,
} from "@/lib/certifications";
import { churchDateKey } from "@/lib/datetime";
import { DeleteCertificationButton, OpenFileButton } from "./certification-controls";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CertificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardada?: string }>;
}) {
  const user = await requireFinancePage();
  const { id } = await params;
  const { guardada } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const [cert, types] = await Promise.all([getCertification(id), listCertificationTypes()]);
  if (!cert) notFound();
  const { row, personName } = cert;
  const status = certificationStatus(row.expires_on, churchDateKey());
  // Un tipo desactivado sigue apareciendo si esta certificación ya lo usa.
  const typeOptions = types
    .filter((t) => t.active || t.id === row.type_id)
    .map((t) => ({ id: t.id, name: t.name }));
  const typeName = types.find((t) => t.id === row.type_id)?.name ?? "Certificación";

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/certificaciones"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Certificaciones
      </Link>
      <PageHeader
        title={personName}
        description={typeName}
        actions={
          <StatusBadge tone={certificationStatusTone[status]}>
            {certificationStatusLabels[status]}
          </StatusBadge>
        }
      />

      {guardada ? (
        <Alert role="status">
          <AlertDescription>Certificación guardada.</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        {row.file_path ? (
          <OpenFileButton id={row.id} />
        ) : (
          <p className="text-muted-foreground text-sm">Sin documento adjunto.</p>
        )}
        {isApostol(user) ? <DeleteCertificationButton id={row.id} /> : null}
      </div>

      <CertificationForm
        certificationId={row.id}
        types={typeOptions}
        initial={{
          person: { id: row.person_id, name: personName },
          typeId: row.type_id,
          issuedOn: row.issued_on ?? "",
          expiresOn: row.expires_on ?? "",
          notes: row.notes ?? "",
          fileName: row.file_path ? (row.file_name ?? "Documento") : null,
        }}
      />
    </div>
  );
}
