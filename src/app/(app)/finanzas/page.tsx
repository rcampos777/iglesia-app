import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, HandCoins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { EmptyState, TableCard } from "@/components/ui-brand/table-card";
import { TotalsPanel } from "@/components/finance/totals-panel";
import { requireFinancePage } from "@/lib/finance/guard";
import {
  defaultPeriod,
  filtersToSearch,
  parseDonationFilters,
  type DonationFilters,
} from "@/lib/finance/filters";
import { getDonationTotals, getPersonName, listDonations } from "@/lib/data/finance";
import { formatDateKey } from "@/lib/datetime";
import { formatCents } from "@/lib/money";
import { donationStatusLabels, donationTypeLabels, paymentMethodLabels } from "@/lib/labels";
import { donationStatusTone } from "@/lib/status-tones";

const PAGE_SIZE = 25;
const selectClass = "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";

function Filters({ f, personName }: { f: DonationFilters; personName: string | null }) {
  return (
    <form
      method="get"
      className="bg-card ring-foreground/10 grid grid-cols-2 gap-3 rounded-xl p-3 shadow-xs ring-1 sm:grid-cols-3 lg:grid-cols-6 lg:items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="desde">Desde</Label>
        <Input id="desde" name="desde" type="date" defaultValue={f.from ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hasta">Hasta</Label>
        <Input id="hasta" name="hasta" type="date" defaultValue={f.to ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tipo">Tipo</Label>
        <select id="tipo" name="tipo" defaultValue={f.type ?? ""} className={selectClass}>
          <option value="">Todos</option>
          {Object.entries(donationTypeLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="forma">Forma de pago</Label>
        <select id="forma" name="forma" defaultValue={f.method ?? ""} className={selectClass}>
          <option value="">Todas</option>
          {Object.entries(paymentMethodLabels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="identidad">Donante</Label>
        <select
          id="identidad"
          name="identidad"
          defaultValue={f.identity ?? ""}
          className={selectClass}
        >
          <option value="">Todas</option>
          <option value="identificadas">Identificadas</option>
          <option value="anonimas">Anónimas</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="estado">Estado</Label>
        <select id="estado" name="estado" defaultValue={f.status ?? ""} className={selectClass}>
          <option value="">Todos</option>
          <option value="vigente">Vigentes</option>
          <option value="anulada">Anuladas</option>
        </select>
      </div>
      {f.personId ? <input type="hidden" name="persona" value={f.personId} /> : null}
      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-3 lg:col-span-6">
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        <Button asChild variant="ghost">
          <Link href="/finanzas">Este mes</Link>
        </Button>
        {f.personId ? (
          <span className="bg-muted inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm">
            Persona: {personName ?? "—"}
            <Link
              href={`/finanzas?${filtersToSearch({ ...f, personId: null })}`}
              className="text-muted-foreground hover:text-foreground underline"
            >
              quitar
            </Link>
          </span>
        ) : null}
      </div>
    </form>
  );
}

export default async function DonationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireFinancePage();
  const params = await searchParams;
  const f = parseDonationFilters(params, defaultPeriod());
  const pageRaw = Array.isArray(params.pagina) ? params.pagina[0] : params.pagina;
  const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);

  const [{ rows, total }, totals, personName] = await Promise.all([
    listDonations(f, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    getDonationTotals(f),
    f.personId ? getPersonName(f.personId) : Promise.resolve(null),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/finanzas?${filtersToSearch(f, p > 1 ? { pagina: String(p) } : {})}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Donaciones"
        description={
          f.from || f.to
            ? `Del ${f.from ? formatDateKey(f.from, true).replace(/^[^,]+,\s*/, "") : "inicio"} al ${
                f.to ? formatDateKey(f.to, true).replace(/^[^,]+,\s*/, "") : "hoy"
              }. Los totales incluyen todas las donaciones vigentes del filtro.`
            : "Todas las fechas. Los totales incluyen todas las donaciones vigentes del filtro."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/finanzas/exportar?${filtersToSearch(f)}`}>
                <Download className="size-4" aria-hidden />
                Exportar CSV
              </a>
            </Button>
            <Button asChild>
              <Link href="/finanzas/nueva">
                <Plus className="size-4" aria-hidden />
                Registrar
              </Link>
            </Button>
          </>
        }
      />

      <Filters f={f} personName={personName} />
      <TotalsPanel totals={totals} />

      <TableCard>
        {rows.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No hay donaciones con estos filtros"
            description="Cambia el período o los filtros, o registra una donación."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Donante</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Tipo</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Forma de pago</th>
                <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-muted/30 relative">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {formatDateKey(d.donation_date, true).replace(/^[^,]+,\s*/, "")}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/finanzas/${d.id}`}
                      className="font-medium after:absolute after:inset-0 hover:underline"
                    >
                      {d.is_anonymous ? (
                        <span className="text-muted-foreground italic">Anónima</span>
                      ) : (
                        d.donor_name
                      )}
                    </Link>
                    <span className="text-muted-foreground block text-xs md:hidden">
                      {donationTypeLabels[d.donation_type]} ·{" "}
                      {paymentMethodLabels[d.payment_method]}
                      {d.status === "anulada" ? " · Anulada" : ""}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    {donationTypeLabels[d.donation_type]}
                  </td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    {paymentMethodLabels[d.payment_method]}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-medium tabular-nums ${d.status === "anulada" ? "text-muted-foreground line-through" : ""}`}
                  >
                    {formatCents(d.amount_cents)}
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <StatusBadge tone={donationStatusTone[d.status]}>
                      {donationStatusLabels[d.status]}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      {total > 0 ? (
        <nav
          aria-label="Paginación"
          className="flex flex-col items-center justify-between gap-3 sm:flex-row"
        >
          <p className="text-muted-foreground text-sm">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={href(page - 1)}>
                    <ChevronLeft className="size-4" aria-hidden />
                    Anterior
                  </Link>
                </Button>
              ) : null}
              <span className="text-muted-foreground px-1 text-sm tabular-nums">
                Página {page} de {pageCount}
              </span>
              {page < pageCount ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={href(page + 1)}>
                    Siguiente
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
