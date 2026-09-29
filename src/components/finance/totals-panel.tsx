import { formatCents } from "@/lib/money";
import { donationTypeLabels, paymentMethodLabels } from "@/lib/labels";
import type { DonationTotals } from "@/types/database";

/** Totales de TODO el filtro (calculados en la base), solo donaciones vigentes. */
export function TotalsPanel({ totals }: { totals: DonationTotals }) {
  const cards = [
    { label: "Total", cents: totals.total_cents, count: totals.count, strong: true },
    { label: "Identificadas", cents: totals.identified_cents, count: totals.identified_count },
    { label: "Anónimas", cents: totals.anonymous_cents, count: totals.anonymous_count },
  ];
  return (
    <section aria-label="Totales del período" className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 ${c.strong ? "col-span-2 sm:col-span-1" : ""}`}
          >
            <dt className="text-muted-foreground text-sm">{c.label}</dt>
            <dd
              className={
                c.strong
                  ? "text-2xl font-semibold tabular-nums"
                  : "text-xl font-semibold tabular-nums"
              }
            >
              {formatCents(c.cents)}
            </dd>
            <dd className="text-muted-foreground text-sm">
              {c.count} {Number(c.count) === 1 ? "donación" : "donaciones"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(
          [
            ["Por tipo", totals.by_type, donationTypeLabels],
            ["Por forma de pago", totals.by_method, paymentMethodLabels],
          ] as const
        ).map(([title, rows, labels]) => (
          <div key={title} className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1">
            <h3 className="mb-2 text-sm font-semibold">{title}</h3>
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin donaciones vigentes en el filtro.</p>
            ) : (
              <ul className="divide-y text-sm">
                {rows.map((r) => (
                  <li key={r.key} className="flex justify-between gap-3 py-1.5">
                    <span>
                      {(labels as Record<string, string>)[r.key]}{" "}
                      <span className="text-muted-foreground">({r.count})</span>
                    </span>
                    <span className="font-medium tabular-nums">{formatCents(r.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
