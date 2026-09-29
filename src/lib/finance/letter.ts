import type { DonationType, LetterData } from "@/types/database";
import { formatCents } from "@/lib/money";
import { formatDateKey } from "@/lib/datetime";
import { donationTypeLabels } from "@/lib/labels";

/**
 * Instantánea de una carta: TODO lo que se imprime. Se guarda tal cual al
 * emitir, junto con el PDF, para que una descarga posterior reproduzca el
 * documento emitido y no se recalcule con datos nuevos. Nunca incluye
 * peticiones de oración ni formas de pago.
 */
export type LetterSnapshot = {
  template: "provisional-v1";
  draft: boolean;
  document_code: string;
  version: number;
  issued_at: string;
  issue_date_text: string;
  person_id: string;
  person_name: string;
  period_start: string;
  period_end: string;
  period_text: string;
  total_cents: number;
  total_text: string;
  donation_count: number;
  donations: { date_text: string; type_text: string; amount_text: string }[];
  church: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    tax_id: string | null;
  };
  recipient: string;
  body: string;
  closing: string;
  signer_name: string | null;
  signer_title: string | null;
};

export function periodText(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  if (fm === "01" && fd === "01" && tm === "12" && td === "31" && fy === ty) {
    return `año ${fy} (1 de enero al 31 de diciembre de ${fy})`;
  }
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const strip = (s: string) => s.replace(/^[^,]+,\s*/, ""); // quita el día de la semana
  return `${lower(strip(formatDateKey(from)))} al ${lower(strip(formatDateKey(to)))}`;
}

/** Sustituye {donante}, {iglesia}, {periodo}, {total}. Sin evaluar nada más. */
export function renderLetterBody(
  template: string,
  values: { donante: string; iglesia: string; periodo: string; total: string },
): string {
  return template.replace(
    /\{(donante|iglesia|periodo|total)\}/g,
    (_, k: keyof typeof values) => values[k],
  );
}

export function buildLetterSnapshot(input: {
  data: LetterData;
  personId: string;
  from: string;
  to: string;
  documentCode: string;
  issuedAt: Date;
}): LetterSnapshot {
  const { data, personId, from, to, documentCode, issuedAt } = input;
  const s = data.settings;
  const period = periodText(from, to);
  const total = formatCents(data.total_cents);
  return {
    template: "provisional-v1",
    draft: s.template_status !== "aprobada",
    document_code: documentCode,
    version: data.next_version,
    issued_at: issuedAt.toISOString(),
    issue_date_text: formatDateKey(
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Puerto_Rico" }).format(issuedAt),
    ).replace(/^[^,]+,\s*/, ""),
    person_id: personId,
    person_name: data.person_name,
    period_start: from,
    period_end: to,
    period_text: period,
    total_cents: Number(data.total_cents),
    total_text: total,
    donation_count: Number(data.donation_count),
    donations: data.donations.map((d) => ({
      date_text: formatDateKey(d.date, true).replace(/^[^,]+,\s*/, ""),
      type_text: donationTypeLabels[d.type as DonationType],
      amount_text: formatCents(d.amount_cents),
    })),
    church: {
      name: s.church_name,
      address: s.address,
      phone: s.phone,
      email: s.email,
      tax_id: s.tax_id,
    },
    recipient: s.letter_recipient,
    body: renderLetterBody(s.letter_body, {
      donante: data.person_name,
      iglesia: s.church_name,
      periodo: period,
      total,
    }),
    closing: s.letter_closing,
    signer_name: s.signer_name,
    signer_title: s.signer_title,
  };
}

export function letterDocumentCode(letterId: string, periodEnd: string, version: number): string {
  return `CDA-${periodEnd.slice(0, 4)}-${letterId.slice(0, 8).toUpperCase()}-v${version}`;
}
