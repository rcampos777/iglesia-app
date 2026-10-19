import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import type { MatchLevel, PersonMatch } from "@/types/database";

export type MatchItem = {
  id: string;
  name: string;
  level: MatchLevel;
  reasons: string[];
  emailHint?: string | null;
  phoneHint?: string | null;
  hasAccount?: boolean;
  inMinistry?: boolean;
  financeOnly?: boolean;
};

export function toMatchItem(m: PersonMatch): MatchItem {
  return {
    id: m.person_id,
    name: m.display_name,
    level: m.level,
    reasons: m.reasons,
    emailHint: m.email_hint,
    phoneHint: m.phone_hint,
    hasAccount: m.has_account,
    inMinistry: m.in_ministry,
    financeOnly: m.finance_only,
  };
}

export const matchLevelLabel: Record<MatchLevel, string> = {
  confiable: "Coincidencia confiable",
  posible: "Posible coincidencia",
};

/**
 * Coincidencias con los datos mínimos para decidir: nombre, qué concuerda
 * y el contacto enmascarado. `action` dibuja el botón de cada una.
 */
export function MatchList({
  items,
  action,
}: {
  items: MatchItem[];
  action?: (item: MatchItem) => ReactNode;
}) {
  return (
    <ul className="divide-y rounded-md border" aria-label="Coincidencias encontradas">
      {items.map((m) => (
        <li
          key={m.id}
          className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.name}</span>
              <StatusBadge tone={m.level === "confiable" ? "warning" : "neutral"}>
                {matchLevelLabel[m.level]}
              </StatusBadge>
              {m.hasAccount !== undefined ? (
                <StatusBadge tone={m.hasAccount ? "active" : "idle"}>
                  {m.hasAccount ? "Con cuenta" : "Sin cuenta"}
                </StatusBadge>
              ) : null}
              {m.inMinistry ? (
                <StatusBadge tone="tracking">Ya está en el ministerio</StatusBadge>
              ) : null}
              {m.financeOnly ? (
                <StatusBadge tone="neutral">Donante (solo Finanzas)</StatusBadge>
              ) : null}
            </div>
            <p className="text-muted-foreground text-sm">
              Concuerda: {m.reasons.join(" · ")}
              {m.emailHint ? ` · ${m.emailHint}` : ""}
              {m.phoneHint ? ` · Tel. ${m.phoneHint}` : ""}
            </p>
          </div>
          {action ? <div className="shrink-0">{action(m)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
