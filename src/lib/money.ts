/**
 * Dinero en centavos enteros. Nunca se convierte a dólares con punto
 * flotante: el texto se interpreta y se formatea con aritmética de enteros.
 */

const AMOUNT_RE = /^\$?\s*(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/;

/** "1,234.5" → 123450. `null` si no es un monto válido (> 0, máx. 2 decimales). */
export function parseAmountToCents(input: string): number | null {
  const m = AMOUNT_RE.exec(input.trim());
  if (!m) return null;
  const whole = m[1]!.replace(/,/g, "");
  if (whole.length > 9) return null;
  const frac = (m[2] ?? "").padEnd(2, "0");
  const cents = Number(whole) * 100 + Number(frac);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function split(cents: number | string): { neg: boolean; dollars: number; rest: number } {
  const n = typeof cents === "string" ? Number(cents) : cents;
  if (!Number.isSafeInteger(n)) throw new Error("Monto fuera de rango");
  const abs = Math.abs(n);
  const rest = abs % 100;
  // (abs - rest) es múltiplo exacto de 100: la división es exacta.
  return { neg: n < 0, dollars: (abs - rest) / 100, rest };
}

/** 123450 → "$1,234.50" */
export function formatCents(cents: number | string): string {
  const { neg, dollars, rest } = split(cents);
  const d = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${d}.${String(rest).padStart(2, "0")}`;
}

/** 123450 → "1234.50" (exportaciones y campos de edición, sin separadores). */
export function centsToPlain(cents: number | string): string {
  const { neg, dollars, rest } = split(cents);
  return `${neg ? "-" : ""}${dollars}.${String(rest).padStart(2, "0")}`;
}
