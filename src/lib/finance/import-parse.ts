import type { DonationPaymentMethod, DonationType } from "@/types/database";

/**
 * Interpreta la tabla de un archivo de donaciones (Excel o CSV) en filas
 * para `finance_import_create_batch()`. No decide nada de personas: solo
 * normaliza fecha, monto, tipo y forma de pago, y anota errores por fila.
 * La base vuelve a validar todo.
 */

export type TableRow = { rowNumber: number; cells: (string | null)[] };

export type DonationImportPayloadRow = {
  row_number: number;
  raw: Record<string, string>;
  donor_name: string;
  family: string;
  donation_date: string | null;
  amount_cents: number | null;
  raw_type: string;
  donation_type: DonationType | null;
  raw_method: string;
  payment_method: DonationPaymentMethod | null;
  reference: string;
  subcategory: string;
  notes: string;
  errors: string[];
};

type Field =
  | "date"
  | "month"
  | "donor_name"
  | "family"
  | "type"
  | "subcategory"
  | "amount"
  | "method"
  | "reference"
  | "notes";

export const REQUIRED_COLUMNS = ["Fecha", "Nombre", "Categoría", "Monto", "Forma de pago"];

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function headerField(header: string): Field | null {
  const h = normalizeText(header.replace(/\(.*?\)/g, ""));
  if (!h) return null;
  if (/^(ano|year)$/.test(h)) return null;
  if (/^mes ?#|^mes num|^numero de mes/.test(h)) return "month";
  if (/^mes\b/.test(h)) return null;
  if (/^fecha/.test(h)) return "date";
  if (/^subcategoria/.test(h)) return "subcategory";
  if (/^(categoria|tipo)/.test(h)) return "type";
  if (/^(nombre|donante|miembro)/.test(h)) return "donor_name";
  if (/^(familia|grupo)/.test(h)) return "family";
  if (/^(monto|cantidad|importe|total)/.test(h)) return "amount";
  if (/^(forma de pago|metodo|pago|forma)/.test(h)) return "method";
  if (/^(referencia|comprobante|recibo)/.test(h)) return "reference";
  if (/^(observacion|nota|comentario)/.test(h)) return "notes";
  return null;
}

const TYPE_MAP: Record<string, DonationType> = {
  diezmo: "diezmo",
  ofrenda: "ofrenda",
  primicia: "primicias",
  semilla: "semilla",
  pacto: "pacto",
};

export function mapDonationType(raw: string): DonationType | null {
  const k = normalizeText(raw).replace(/s$/, "");
  return TYPE_MAP[k] ?? null;
}

export function mapPaymentMethod(raw: string): DonationPaymentMethod | null {
  const k = normalizeText(raw)
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(efectivo|cash|cash efectivo|efectivo cash)$/.test(k)) return "efectivo";
  if (/^ath ?movil$/.test(k)) return "ath_movil";
  if (k === "ath") return "ath";
  if (
    /^(credito|tarjeta|tarjeta de credito|visa|master ?card|mc|amex|american express|discover)$/.test(
      k,
    )
  )
    return "credito";
  if (/^(cheque|check|ck)$/.test(k)) return "cheque";
  if (/^(giro|giro postal|money order)$/.test(k)) return "giro";
  return null;
}

/**
 * Monto a centavos sin punto flotante, redondeando al centavo (Excel
 * guarda 33.333333333333336). Acepta "$1,234.50" y "1234.5".
 */
export function amountToCents(input: string): number | null {
  let s = input.replace(/[$\s,]/g, "");
  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    s = n.toFixed(4);
  }
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const whole = m[1]!.replace(/^0+(?=\d)/, "");
  if (whole.length > 9) return null;
  const frac = (m[2] ?? "").padEnd(3, "0");
  let cents = Number(whole) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  return cents > 0 ? cents : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Fecha de Excel (número de serie) o texto. "1/5/2026" es ambiguo: se usa
 * la columna "Mes #" si existe; si no, se asume mes/día (formato de PR/EE.UU.).
 */
export function parseDateCell(
  value: string,
  opts: { date1904?: boolean; monthHint?: number | null } = {},
): string | null {
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) {
    const serial = Math.floor(Number(v));
    if (serial < 1 || serial > 2958465) return null;
    const base = opts.date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    return new Date(base + serial * 86400000).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (opts.monthHint && a !== b) {
      if (a === opts.monthHint) return validYmd(y, a, b);
      if (b === opts.monthHint) return validYmd(y, b, a);
    }
    if (a > 12) return validYmd(y, b, a);
    return validYmd(y, a, b);
  }
  return null;
}

export type InterpretResult =
  { ok: true; rows: DonationImportPayloadRow[]; sheetName?: string } | { ok: false; error: string };

function findHeader(rows: TableRow[]): { index: number; fields: (Field | null)[] } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const fields = rows[i]!.cells.map((c) => (c ? headerField(c) : null));
    if (fields.includes("date") && fields.includes("amount")) return { index: i, fields };
  }
  return null;
}

/** `today` = fecha local de la iglesia (YYYY-MM-DD), para rechazar futuras. */
export function interpretDonationTable(
  table: TableRow[],
  opts: { today: string; date1904?: boolean },
): InterpretResult {
  const header = findHeader(table);
  if (!header) {
    return {
      ok: false,
      error: `No se encontraron las columnas. El archivo debe tener encabezados como: ${REQUIRED_COLUMNS.join(", ")}.`,
    };
  }
  const missing = (["donor_name", "type", "method"] as Field[]).filter(
    (f) => !header.fields.includes(f),
  );
  if (missing.length > 0) {
    const names: Record<string, string> = {
      donor_name: "Nombre",
      type: "Categoría",
      method: "Forma de pago",
    };
    return {
      ok: false,
      error: `Faltan columnas: ${missing.map((f) => names[f]).join(", ")}.`,
    };
  }

  const headerCells = table[header.index]!.cells;
  const out: DonationImportPayloadRow[] = [];
  for (const row of table.slice(header.index + 1)) {
    const get = (f: Field) => {
      const i = header.fields.indexOf(f);
      return i >= 0 ? (row.cells[i] ?? "").trim() : "";
    };
    const dateRaw = get("date");
    const amountRaw = get("amount");
    const name = get("donor_name");
    const family = get("family");
    const rawType = get("type");
    const rawMethod = get("method");
    // Filas vacías (plantillas con fórmulas hasta abajo).
    if (!dateRaw && !amountRaw && !name && !family && !rawType && !rawMethod) continue;

    const raw: Record<string, string> = {};
    headerCells.forEach((h, i) => {
      const v = row.cells[i];
      if (h && v) raw[h.trim()] = v.trim();
    });

    const monthHint = Number(get("month")) || null;
    const errors: string[] = [];
    const date = dateRaw ? parseDateCell(dateRaw, { date1904: opts.date1904, monthHint }) : null;
    if (!date) errors.push(dateRaw ? "Fecha inválida." : "Falta la fecha.");
    else if (date > opts.today) errors.push("La fecha no puede ser futura.");
    const cents = amountRaw ? amountToCents(amountRaw) : null;
    if (cents === null) errors.push(amountRaw ? "Monto inválido." : "Falta el monto.");
    else if (cents > 100_000_000) errors.push("El monto máximo es $1,000,000.00.");

    out.push({
      row_number: row.rowNumber,
      raw,
      donor_name: name,
      family,
      donation_date: date,
      amount_cents: cents,
      raw_type: rawType,
      donation_type: mapDonationType(rawType),
      raw_method: rawMethod,
      payment_method: mapPaymentMethod(rawMethod),
      reference: get("reference"),
      subcategory: get("subcategory"),
      notes: get("notes"),
      errors,
    });
  }

  flagRareYears(out);
  if (out.length === 0) return { ok: false, error: "El archivo no tiene filas con datos." };
  return { ok: true, rows: out };
}

/**
 * Un año que casi no aparece (p. ej. 2016 entre 2,000 filas de 2026) suele
 * ser un error de escritura: la fila se marca para revisar en vez de
 * importarse en otro año.
 */
function flagRareYears(rows: DonationImportPayloadRow[]): void {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.errors.length === 0 && r.donation_date) {
      const y = r.donation_date.slice(0, 4);
      counts.set(y, (counts.get(y) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < 20) return;
  const threshold = Math.max(5, Math.ceil(total * 0.01));
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  for (const r of rows) {
    const y = r.donation_date?.slice(0, 4);
    if (r.errors.length === 0 && y && y !== main && (counts.get(y) ?? 0) < threshold) {
      r.errors.push(`Año ${y} poco común en este archivo (casi todo es ${main}); revisa la fecha.`);
    }
  }
}
