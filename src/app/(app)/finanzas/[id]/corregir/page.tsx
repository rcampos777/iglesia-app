import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { DonationForm } from "@/components/finance/donation-form";
import { requireFinancePage } from "@/lib/finance/guard";
import { getDonation } from "@/lib/data/finance";
import { churchDateKey } from "@/lib/datetime";
import { centsToPlain } from "@/lib/money";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CorrectDonationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFinancePage();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const detail = await getDonation(id);
  if (!detail) notFound();
  const d = detail.donation;
  if (d.status === "anulada") redirect(`/finanzas/${id}`);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/finanzas/${id}`}>
          <ArrowLeft className="size-4" aria-hidden />
          Volver al detalle
        </Link>
      </Button>
      <PageHeader
        title="Corregir donación"
        description="Los valores anteriores se conservan en el historial. Si otra persona la cambia mientras editas, se te pedirá recargar."
      />
      <section className="bg-card ring-foreground/10 max-w-2xl rounded-xl p-4 shadow-xs ring-1 sm:p-6">
        <DonationForm
          mode="corregir"
          today={churchDateKey()}
          donationId={id}
          version={d.version}
          initial={{
            person:
              d.person_id && detail.donor_name
                ? { id: d.person_id, name: detail.donor_name }
                : null,
            anonymous: d.is_anonymous,
            date: d.donation_date,
            amount: centsToPlain(d.amount_cents),
            type: d.donation_type,
            method: d.payment_method,
            reference: d.reference ?? "",
          }}
        />
      </section>
    </div>
  );
}
