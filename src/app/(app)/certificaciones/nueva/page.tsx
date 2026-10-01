import { PageHeader } from "@/components/ui-brand/page-header";
import { CertificationForm } from "@/components/certifications/certification-form";
import { requireFinancePage } from "@/lib/finance/guard";
import { listCertificationTypes } from "@/lib/data/certifications";

export default async function NewCertificationPage() {
  await requireFinancePage();
  const types = (await listCertificationTypes()).filter((t) => t.active);
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Nueva certificación"
        description="Busca a la persona, elige el tipo y adjunta el documento."
      />
      <CertificationForm types={types.map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
