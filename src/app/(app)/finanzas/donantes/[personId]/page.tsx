import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { LettersTable } from "@/components/finance/letters-table";
import { requireFinancePage } from "@/lib/finance/guard";
import { getDonorYearly, getPersonName, listLetters } from "@/lib/data/finance";
import { formatCents } from "@/lib/money";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Historial financiero de una persona: solo Apóstol y Finanzas. */
export default async function DonorPage({ params }: { params: Promise<{ personId: string }> }) {
  await requireFinancePage();
  const { personId } = await params;
  if (!UUID_RE.test(personId)) notFound();
  const name = await getPersonName(personId);
  if (!name) notFound();
  const [yearly, letters] = await Promise.all([getDonorYearly(personId), listLetters(personId)]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/finanzas">
          <ArrowLeft className="size-4" aria-hidden />
          Donaciones
        </Link>
      </Button>
      <PageHeader
        title={name}
        description="Aportaciones identificadas y vigentes. Las anónimas no se asocian a ninguna persona."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/finanzas?desde=&hasta=&persona=${personId}`}>
                <ListFilter className="size-4" aria-hidden />
                Ver todas sus donaciones
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/finanzas/cartas?persona=${personId}`}>
                <FileText className="size-4" aria-hidden />
                Generar carta
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
          <h2 className="mb-3 text-base font-semibold">Por año</h2>
          {yearly.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No tiene donaciones vigentes registradas.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {yearly.map((y) => (
                <li key={y.year} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/finanzas?desde=${y.year}-01-01&hasta=${y.year}-12-31&persona=${personId}`}
                    className="font-medium hover:underline"
                  >
                    {y.year}
                  </Link>
                  <span className="text-muted-foreground">
                    {y.donation_count} {Number(y.donation_count) === 1 ? "donación" : "donaciones"}
                  </span>
                  <span className="font-semibold tabular-nums">{formatCents(y.total_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
          <h2 className="mb-3 text-base font-semibold">Cartas emitidas</h2>
          <LettersTable letters={letters} />
        </section>
      </div>
    </div>
  );
}
