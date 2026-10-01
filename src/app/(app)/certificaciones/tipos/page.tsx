import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui-brand/page-header";
import { requireFinancePage } from "@/lib/finance/guard";
import { listCertificationTypes } from "@/lib/data/certifications";
import { TypesManager } from "./types-manager";

export default async function CertificationTypesPage() {
  await requireFinancePage();
  const types = await listCertificationTypes();
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
        title="Tipos de certificación"
        description="Un tipo desactivado ya no aparece al registrar, pero se conservan las certificaciones que lo usan."
      />
      <TypesManager
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          active: t.active,
        }))}
      />
    </div>
  );
}
