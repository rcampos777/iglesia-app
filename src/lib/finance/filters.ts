import type { DonationPaymentMethod, DonationStatus, DonationType } from "@/types/database";
import { donationTypeLabels, paymentMethodLabels } from "@/lib/labels";
import { churchDateKey } from "@/lib/datetime";

/** Filtros del listado y de la exportación (vienen de la URL; se validan aquí). */
export type DonationFilters = {
  from: string | null;
  to: string | null;
  personId: string | null;
  type: DonationType | null;
  method: DonationPaymentMethod | null;
  status: DonationStatus | null;
  identity: "identificadas" | "anonimas" | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;

function one(p: Params, k: string): string | undefined {
  const v = p[k];
  return Array.isArray(v) ? v[0] : v;
}

export function parseDonationFilters(
  p: Params,
  defaults: { from: string; to: string },
): DonationFilters {
  const from = one(p, "desde");
  const to = one(p, "hasta");
  const type = one(p, "tipo");
  const method = one(p, "forma");
  const status = one(p, "estado");
  const identity = one(p, "identidad");
  const person = one(p, "persona");
  let f = from && DATE_RE.test(from) ? from : from === "" ? null : defaults.from;
  let t = to && DATE_RE.test(to) ? to : to === "" ? null : defaults.to;
  if (f && t && f > t) [f, t] = [t, f];
  return {
    from: f,
    to: t,
    personId: person && UUID_RE.test(person) ? person : null,
    type: type && type in donationTypeLabels ? (type as DonationType) : null,
    method: method && method in paymentMethodLabels ? (method as DonationPaymentMethod) : null,
    status: status === "vigente" || status === "anulada" ? status : null,
    identity: identity === "identificadas" || identity === "anonimas" ? identity : null,
  };
}

export function filtersToSearch(f: DonationFilters, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams();
  qs.set("desde", f.from ?? "");
  qs.set("hasta", f.to ?? "");
  if (f.personId) qs.set("persona", f.personId);
  if (f.type) qs.set("tipo", f.type);
  if (f.method) qs.set("forma", f.method);
  if (f.status) qs.set("estado", f.status);
  if (f.identity) qs.set("identidad", f.identity);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  return qs.toString();
}

/** Por defecto: el mes en curso, en hora de Puerto Rico. */
export function defaultPeriod() {
  const today = churchDateKey();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
