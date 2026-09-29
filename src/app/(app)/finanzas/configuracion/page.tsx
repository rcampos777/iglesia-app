import { PageHeader } from "@/components/ui-brand/page-header";
import { requireFinancePage } from "@/lib/finance/guard";
import { isApostol } from "@/lib/auth/finance";
import { getFinanceSettings } from "@/lib/data/finance";
import { SettingsForm } from "./settings-form";

export default async function FinanceSettingsPage() {
  const user = await requireFinancePage();
  const settings = await getFinanceSettings();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración de cartas"
        description="Plantilla provisional: queda marcada como BORRADOR hasta que la iglesia envíe su ejemplo y un Apóstol la apruebe."
      />
      <section className="bg-card ring-foreground/10 max-w-3xl rounded-xl p-4 shadow-xs ring-1 sm:p-6">
        {settings ? (
          <SettingsForm settings={settings} canApprove={isApostol(user)} />
        ) : (
          <p className="text-muted-foreground text-sm">No se encontró la configuración.</p>
        )}
      </section>
    </div>
  );
}
