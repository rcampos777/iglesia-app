import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { requireFinancePage } from "@/lib/finance/guard";
import { getDonation } from "@/lib/data/finance";
import { formatCents } from "@/lib/money";
import { formatDateKey } from "@/lib/datetime";
import { donationStatusLabels, donationTypeLabels, paymentMethodLabels } from "@/lib/labels";
import { donationStatusTone } from "@/lib/status-tones";
import type { DonationRow } from "@/types/database";
import { PrayerNotePanel, VoidDonationButton } from "./donation-actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_LABELS: Record<string, string> = {
  person_id: "Donante",
  is_anonymous: "Anónima",
  donation_date: "Fecha",
  amount_cents: "Cantidad",
  donation_type: "Tipo",
  payment_method: "Forma de pago",
  reference: "Referencia",
  status: "Estado",
};

function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "amount_cents") return formatCents(Number(v));
  if (key === "donation_type")
    return donationTypeLabels[v as DonationRow["donation_type"]] ?? String(v);
  if (key === "payment_method")
    return paymentMethodLabels[v as DonationRow["payment_method"]] ?? String(v);
  if (key === "donation_date") return formatDateKey(String(v), true).replace(/^[^,]+,\s*/, "");
  if (key === "is_anonymous") return v ? "Sí" : "No";
  if (key === "status") return donationStatusLabels[v as DonationRow["status"]] ?? String(v);
  if (key === "person_id") return "otra persona";
  return String(v);
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-PR", {
    timeZone: "America/Puerto_Rico",
    dateStyle: "medium",
    timeStyle: "short",
  });

export default async function DonationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ corregida?: string }>;
}) {
  await requireFinancePage();
  const { id } = await params;
  const { corregida } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const detail = await getDonation(id);
  if (!detail) notFound();
  const d = detail.donation;

  const rows: [string, React.ReactNode][] = [
    [
      "Donante",
      d.is_anonymous ? (
        <span className="italic">Anónima</span>
      ) : (
        <Link href={`/finanzas/donantes/${d.person_id}`} className="font-medium hover:underline">
          {detail.donor_name}
        </Link>
      ),
    ],
    ["Fecha", fmt("donation_date", d.donation_date)],
    ["Tipo", donationTypeLabels[d.donation_type]],
    ["Forma de pago", paymentMethodLabels[d.payment_method]],
    ["Referencia", d.reference ?? "—"],
    [
      "Registrada",
      `${dateTime(d.created_at)}${detail.created_by_name ? ` por ${detail.created_by_name}` : ""}`,
    ],
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/finanzas">
          <ArrowLeft className="size-4" aria-hidden />
          Donaciones
        </Link>
      </Button>
      <PageHeader
        eyebrow={
          <StatusBadge tone={donationStatusTone[d.status]}>
            {donationStatusLabels[d.status]}
          </StatusBadge>
        }
        title={
          <span className={d.status === "anulada" ? "line-through" : ""}>
            {formatCents(d.amount_cents)}
          </span>
        }
        description={`${donationTypeLabels[d.donation_type]} · ${fmt("donation_date", d.donation_date)}`}
        actions={
          d.status === "vigente" ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/finanzas/${d.id}/corregir`}>
                  <Pencil className="size-4" aria-hidden />
                  Corregir
                </Link>
              </Button>
              <VoidDonationButton donationId={d.id} version={d.version} />
            </>
          ) : null
        }
      />

      {corregida ? (
        <p
          role="status"
          className="border-state-active/40 bg-state-active/10 rounded-lg border p-3 text-sm"
        >
          Corrección guardada. El valor anterior quedó en el historial.
        </p>
      ) : null}
      {d.status === "anulada" ? (
        <p className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-sm">
          Anulada el {dateTime(d.voided_at!)}. Motivo: {d.void_reason}. No cuenta en totales ni
          cartas.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="space-y-4 lg:col-span-2">
          <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-sm">{label}</dt>
                  <dd className="text-[15px]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            aria-labelledby="historial"
            className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5"
          >
            <h2 id="historial" className="mb-3 flex items-center gap-2 text-base font-semibold">
              <History className="text-muted-foreground size-[18px]" aria-hidden />
              Historial
            </h2>
            <ol className="space-y-3">
              {detail.revisions.map((r) => {
                const changed =
                  r.before && r.action === "corregida"
                    ? Object.keys(FIELD_LABELS).filter(
                        (k) =>
                          JSON.stringify((r.before as Record<string, unknown>)[k]) !==
                          JSON.stringify((r.after as Record<string, unknown>)[k]),
                      )
                    : [];
                return (
                  <li key={r.revision} className="border-l-2 pl-3">
                    <p className="text-sm font-medium">
                      {r.action === "creada"
                        ? "Registrada"
                        : r.action === "corregida"
                          ? "Corregida"
                          : "Anulada"}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {dateTime(r.created_at)}
                        {r.actor_name ? ` · ${r.actor_name}` : ""}
                      </span>
                    </p>
                    {changed.length > 0 ? (
                      <ul className="text-muted-foreground mt-1 text-sm">
                        {changed.map((k) => (
                          <li key={k}>
                            {FIELD_LABELS[k]}: {fmt(k, (r.before as Record<string, unknown>)[k])} →{" "}
                            <span className="text-foreground">
                              {fmt(k, (r.after as Record<string, unknown>)[k])}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {r.reason ? <p className="mt-1 text-sm">Motivo: {r.reason}</p> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          {detail.has_prayer_note ? <PrayerNotePanel donationId={d.id} /> : null}
        </div>
      </div>
    </div>
  );
}
