import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui-brand/page-header";
import { LetterPreview } from "@/components/finance/letter-preview";
import { LettersTable } from "@/components/finance/letters-table";
import { requireFinancePage } from "@/lib/finance/guard";
import { getLetterData, getPersonName, listLetters } from "@/lib/data/finance";
import { buildLetterSnapshot } from "@/lib/finance/letter";
import { churchDateKey } from "@/lib/datetime";
import { formatCents } from "@/lib/money";
import { IssueLetterButton, LetterPersonSelect } from "./letter-controls";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string; desde?: string; hasta?: string }>;
}) {
  await requireFinancePage();
  const sp = await searchParams;
  const lastYear = Number(churchDateKey().slice(0, 4)) - 1;
  let from = sp.desde && DATE_RE.test(sp.desde) ? sp.desde : `${lastYear}-01-01`;
  let to = sp.hasta && DATE_RE.test(sp.hasta) ? sp.hasta : `${lastYear}-12-31`;
  if (from > to) [from, to] = [to, from];
  const personId = sp.persona && UUID_RE.test(sp.persona) ? sp.persona : null;
  const personName = personId ? await getPersonName(personId) : null;

  const [data, letters] = await Promise.all([
    personId && personName ? getLetterData(personId, from, to) : Promise.resolve(null),
    listLetters(personId ?? undefined),
  ]);
  const preview =
    data && personId
      ? buildLetterSnapshot({
          data,
          personId,
          from,
          to,
          documentCode: "(se asigna al emitir)",
          issuedAt: new Date(),
        })
      : null;
  const years = Array.from({ length: 6 }, (_, i) => lastYear + 1 - i);
  const qs = (f: string, t: string) =>
    `/finanzas/cartas?${personId ? `persona=${personId}&` : ""}desde=${f}&hasta=${t}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartas de donaciones"
        description="Certificación del total registrado de una persona en un período. Excluye donaciones anónimas y anuladas."
      />

      <section className="bg-card ring-foreground/10 grid grid-cols-1 gap-4 rounded-xl p-4 shadow-xs ring-1 sm:p-5 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="carta-persona">1. Persona</Label>
          <LetterPersonSelect
            initial={personId && personName ? { id: personId, name: personName } : null}
            from={from}
            to={to}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">2. Período</p>
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => {
              const active = from === `${y}-01-01` && to === `${y}-12-31`;
              return (
                <Button key={y} asChild size="sm" variant={active ? "default" : "outline"}>
                  <Link
                    href={qs(`${y}-01-01`, `${y}-12-31`)}
                    aria-current={active ? "true" : undefined}
                  >
                    {y}
                  </Link>
                </Button>
              );
            })}
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            {personId ? <input type="hidden" name="persona" value={personId} /> : null}
            <div className="space-y-1">
              <Label htmlFor="desde" className="text-muted-foreground text-xs">
                Desde
              </Label>
              <Input id="desde" name="desde" type="date" defaultValue={from} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hasta" className="text-muted-foreground text-xs">
                Hasta
              </Label>
              <Input id="hasta" name="hasta" type="date" defaultValue={to} className="w-40" />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Usar período
            </Button>
          </form>
        </div>
      </section>

      {data && preview && personId ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5 xl:gap-6">
          <section className="bg-card ring-foreground/10 space-y-4 rounded-xl p-4 shadow-xs ring-1 sm:p-5 xl:col-span-2">
            <h2 className="text-base font-semibold">3. Aportaciones incluidas</h2>
            <p className="text-sm">
              <span className="text-2xl font-semibold tabular-nums">
                {formatCents(data.total_cents)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {data.donation_count}{" "}
                {Number(data.donation_count) === 1 ? "aportación" : "aportaciones"}
              </span>
            </p>
            {data.donations.length > 0 ? (
              <ul className="max-h-80 divide-y overflow-y-auto rounded-md border text-sm">
                {preview.donations.map((d, i) => (
                  <li key={i} className="flex justify-between gap-3 px-3 py-1.5">
                    <span>
                      {d.date_text} <span className="text-muted-foreground">· {d.type_text}</span>
                    </span>
                    <span className="tabular-nums">{d.amount_text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                No hay aportaciones identificadas y vigentes en este período.
              </p>
            )}
            <div className="space-y-2 border-t pt-4">
              <h2 className="text-base font-semibold">4. Emitir</h2>
              {preview.draft ? (
                <p className="border-state-warning/40 bg-state-warning/10 rounded-md border p-2.5 text-sm">
                  La plantilla es un <strong>borrador provisional</strong>: el PDF saldrá marcado
                  como tal. Un Apóstol la aprueba en Configuración cuando la iglesia confirme el
                  texto y los datos.
                </p>
              ) : null}
              <Button asChild variant="outline">
                <a
                  href={`/finanzas/cartas/vista-previa?persona=${personId}&desde=${from}&hasta=${to}`}
                  target="_blank"
                  rel="noopener"
                >
                  <Eye className="size-4" aria-hidden />
                  Vista previa en PDF
                </a>
              </Button>
              <IssueLetterButton
                personId={personId}
                from={from}
                to={to}
                expectedTotalCents={Number(data.total_cents)}
                expectedCount={Number(data.donation_count)}
                expectedVersion={Number(data.next_version)}
              />
              <p className="text-muted-foreground text-xs">
                Se guarda una copia exacta del PDF y del total. Si después se corrige una donación,
                esta carta no cambia: se marca para revisión.
              </p>
            </div>
          </section>
          <div className="xl:col-span-3">
            <LetterPreview s={preview} />
          </div>
        </div>
      ) : null}

      <section className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5">
        <h2 className="mb-3 text-base font-semibold">
          {personId ? "Versiones emitidas para esta persona" : "Cartas emitidas recientemente"}
        </h2>
        <LettersTable letters={letters} showPerson={!personId} />
      </section>
    </div>
  );
}
