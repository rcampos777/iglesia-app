/**
 * Fechas y horas de la iglesia. Todo se muestra en la zona de Puerto Rico
 * sin importar la zona del servidor (Vercel corre en UTC) ni la del
 * dispositivo del usuario.
 */
export const CHURCH_TIME_ZONE = "America/Puerto_Rico";

const dateFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: CHURCH_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dateYearFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: CHURCH_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortDateFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: CHURCH_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: CHURCH_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const isoDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CHURCH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Domingo, 4 de octubre" (con año si se pide). */
export function formatChurchDate(instant: string | Date, withYear = false): string {
  return capitalize((withYear ? dateYearFmt : dateFmt).format(new Date(instant)));
}

/** "dom, 4 oct". */
export function formatChurchShortDate(instant: string | Date): string {
  return capitalize(shortDateFmt.format(new Date(instant)));
}

/** "9:30 a. m.". */
export function formatChurchTime(instant: string | Date): string {
  return timeFmt.format(new Date(instant));
}

/** Fecha local de la iglesia en formato YYYY-MM-DD. */
export function churchDateKey(instant: string | Date = new Date()): string {
  return isoDateFmt.format(new Date(instant));
}

/** Suma días a una fecha YYYY-MM-DD (aritmética de calendario, sin zonas). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fecha YYYY-MM-DD como texto legible ("Domingo, 4 de octubre de 2026"). */
export function formatDateKey(dateKey: string, withYear = true): string {
  // Mediodía UTC cae el mismo día en Puerto Rico (UTC−4).
  return formatChurchDate(`${dateKey}T16:00:00Z`, withYear);
}

/** "lunes, 28 de septiembre de 2026", para usar a mitad de frase. */
export function formatDateKeyInline(dateKey: string, withYear = true): string {
  const text = formatDateKey(dateKey, withYear);
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "HH:MM:SS" → "7:30 p. m." sin depender de ninguna zona. */
export function formatLocalTime(time: string): string {
  const [h = "0", m = "0"] = time.split(":");
  return timeFmt.format(new Date(Date.UTC(2026, 0, 1, Number(h) + 4, Number(m))));
}
