import Link from "next/link";
import { PageHeader } from "@/components/ui-brand/page-header";
import { requireFinancePage } from "@/lib/finance/guard";
import { getFinanceLinkSuggestions } from "@/lib/data/finance-import";
import { LinkSuggestionCard } from "@/components/finance/link-donor";

/**
 * Donantes de Finanzas que se parecen a alguien del directorio (por
 * ejemplo, porque se registró en la app): unirlos deja un solo registro.
 */
export default async function LinkDonorsPage() {
  await requireFinancePage();
  const suggestions = await getFinanceLinkSuggestions();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vincular donantes"
        description="Donantes de Finanzas cuyo nombre se parece a una persona registrada. Al vincular, sus donaciones y cartas pasan a esa persona y queda un solo registro."
      />
      {suggestions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No hay posibles vínculos. También puedes vincular desde la ficha de cada donante (
          <Link href="/finanzas" className="underline">
            Donaciones
          </Link>{" "}
          → nombre del donante).
        </p>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <LinkSuggestionCard key={`${s.donor_id}:${s.person_id}`} suggestion={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
