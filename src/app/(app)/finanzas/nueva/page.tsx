import { PageHeader } from "@/components/ui-brand/page-header";
import { DonationForm } from "@/components/finance/donation-form";
import { requireFinancePage } from "@/lib/finance/guard";
import { churchDateKey } from "@/lib/datetime";

export default async function NewDonationPage() {
  await requireFinancePage();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Registrar donación"
        description="Registra un pago ya recibido. Esta app no procesa tarjetas ni mueve dinero."
      />
      <section className="bg-card ring-foreground/10 max-w-2xl rounded-xl p-4 shadow-xs ring-1 sm:p-6">
        <DonationForm mode="crear" today={churchDateKey()} />
      </section>
    </div>
  );
}
