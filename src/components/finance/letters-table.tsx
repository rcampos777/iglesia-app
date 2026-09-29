import { Download } from "lucide-react";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { formatCents } from "@/lib/money";
import { formatDateKey } from "@/lib/datetime";
import { letterStatusLabels } from "@/lib/labels";
import { letterStatusTone } from "@/lib/status-tones";
import type { DonationLetterListItem } from "@/types/database";

const short = (k: string) => formatDateKey(k, true).replace(/^[^,]+,\s*/, "");

/** Versiones emitidas. La descarga devuelve el PDF guardado, nunca uno recalculado. */
export function LettersTable({
  letters,
  showPerson,
}: {
  letters: DonationLetterListItem[];
  showPerson?: boolean;
}) {
  if (letters.length === 0) {
    return <p className="text-muted-foreground text-sm">Todavía no se han emitido cartas.</p>;
  }
  return (
    <ul className="divide-y">
      {letters.map((l) => (
        <li
          key={l.id}
          className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="font-medium">
              {showPerson ? `${l.person_name} · ` : ""}
              {short(l.period_start)} – {short(l.period_end)}
            </p>
            <p className="text-muted-foreground text-sm">
              {l.document_code} · versión {l.version} · {formatCents(l.total_cents)} ·{" "}
              {new Date(l.issued_at).toLocaleDateString("es-PR", {
                timeZone: "America/Puerto_Rico",
              })}
              {l.issued_by_name ? ` · ${l.issued_by_name}` : ""}
            </p>
            {l.status === "requiere_revision" && l.review_reason ? (
              <p className="text-state-warning text-sm">
                {l.review_reason} Genera una nueva versión si corresponde.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge tone={letterStatusTone[l.status]}>
              {letterStatusLabels[l.status]}
            </StatusBadge>
            <a
              href={`/finanzas/cartas/${l.id}/pdf`}
              className="hover:bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium"
            >
              <Download className="size-4" aria-hidden />
              PDF
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
