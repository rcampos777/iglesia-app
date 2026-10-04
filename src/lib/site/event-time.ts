/**
 * Fecha y hora de los eventos del sitio (0050). La hora es opcional: sin
 * hora, el inicio se guarda a las 00:00 y el fin a las 23:59 de Puerto Rico
 * (UTC−4 todo el año), y los indicadores *_has_time dicen qué mostrar.
 */
import { churchDateKey } from "@/lib/datetime";

const TZ = "America/Puerto_Rico";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export type EventParts = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

export type EventRange = {
  startsAt: string;
  endsAt: string | null;
  startHasTime: boolean;
  endHasTime: boolean;
};

function prIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00-04:00`).toISOString();
}

/** Formulario → columnas. Devuelve un mensaje en español si algo no cuadra. */
export function partsToRange(p: EventParts): EventRange | string {
  const startDate = p.startDate.trim();
  const startTime = p.startTime.trim();
  const endDate = p.endDate.trim();
  const endTime = p.endTime.trim();
  if (!DATE_RE.test(startDate)) return "Un evento necesita fecha de inicio.";
  if (startTime && !TIME_RE.test(startTime)) return "Hora de inicio inválida.";
  if (endDate && !DATE_RE.test(endDate)) return "Fecha de fin inválida.";
  if (endTime && !TIME_RE.test(endTime)) return "Hora de fin inválida.";

  const startsAt = prIso(startDate, startTime || "00:00");
  let endsAt: string | null = null;
  let endHasTime = true;
  if (endDate || endTime) {
    endsAt = prIso(endDate || startDate, endTime || "23:59");
    endHasTime = Boolean(endTime);
  } else if (!startTime) {
    // Solo fecha: el evento dura todo ese día (sigue en "Próximos" hasta
    // que termina el día).
    endsAt = prIso(startDate, "23:59");
    endHasTime = false;
  }
  if (endsAt && endsAt < startsAt) {
    return endDate
      ? "El fin no puede ser antes del inicio."
      : "La hora de fin es antes que la de inicio. Si el evento dura más de un día, pon la fecha de fin.";
  }
  return { startsAt, endsAt, startHasTime: Boolean(startTime), endHasTime };
}

function prTime(iso: string): string {
  return new Date(new Date(iso).getTime() - 4 * 3600_000).toISOString().slice(11, 16);
}

/** Columnas → formulario. */
export function rangeToParts(r: Partial<EventRange> | null): EventParts {
  if (!r?.startsAt) return { startDate: "", startTime: "", endDate: "", endTime: "" };
  const startDate = churchDateKey(r.startsAt);
  const startTime = r.startHasTime === false ? "" : prTime(r.startsAt);
  if (!r.endsAt) return { startDate, startTime, endDate: "", endTime: "" };
  const endDate = churchDateKey(r.endsAt);
  const endTime = r.endHasTime === false ? "" : prTime(r.endsAt);
  // Fin automático (mismo día, sin hora): el formulario lo deja vacío.
  if (endDate === startDate && !endTime) return { startDate, startTime, endDate: "", endTime: "" };
  return { startDate, startTime, endDate: endDate === startDate ? "" : endDate, endTime };
}

const fmt = (o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-PR", { timeZone: TZ, ...o });
const timeFmt = fmt({ hour: "numeric", minute: "2-digit" });
const weekdayFmt = fmt({ weekday: "long" });
const shortFmt = fmt({ day: "numeric", month: "short" });
const longFmt = fmt({ weekday: "long", day: "numeric", month: "long" });
const longYearFmt = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type When = {
  startsAt: string;
  endsAt?: string | null;
  startHasTime?: boolean;
  endHasTime?: boolean;
};

function multiDay(w: When): boolean {
  return Boolean(w.endsAt) && churchDateKey(w.endsAt!) !== churchDateKey(w.startsAt);
}

/** Solo la hora ("6:00 p. m. – 9:00 p. m."), o null si no se puso hora. */
export function eventTimeText(w: When): string | null {
  const start = w.startHasTime === false ? null : timeFmt.format(new Date(w.startsAt));
  if (multiDay(w)) {
    const end = w.endHasTime === false ? null : timeFmt.format(new Date(w.endsAt!));
    const out = [start && `Empieza ${start}`, end && `termina ${end}`].filter(Boolean).join(", ");
    return out ? cap(out) : null;
  }
  const end =
    w.endsAt && w.endHasTime !== false && !multiDay(w) ? timeFmt.format(new Date(w.endsAt)) : null;
  if (start && end) return `${start} – ${end}`;
  return start ?? (end ? `Hasta las ${end}` : null);
}

/** Línea corta para listas: "Viernes · 6:00 p. m." o "30 oct. – 1 nov.". */
export function eventSubtitle(w: When): string {
  if (multiDay(w)) {
    const part = (iso: string, hasTime: boolean | undefined) =>
      shortFmt.format(new Date(iso)) +
      (hasTime === false ? "" : `, ${timeFmt.format(new Date(iso))}`);
    return `${part(w.startsAt, w.startHasTime)} – ${part(w.endsAt!, w.endHasTime)}`;
  }
  const day = cap(weekdayFmt.format(new Date(w.startsAt)));
  const time = eventTimeText(w);
  return time ? `${day} · ${time}` : day;
}

/** Fecha larga: "Viernes, 30 de octubre de 2026" o "Del jueves 30 de octubre al domingo 1 de noviembre". */
export function eventDateText(w: When, withYear = false): string {
  if (multiDay(w)) {
    const noComma = (f: Intl.DateTimeFormat, iso: string) =>
      f.format(new Date(iso)).replace(",", "");
    return `Del ${noComma(longFmt, w.startsAt)} al ${noComma(withYear ? longYearFmt : longFmt, w.endsAt!)}`;
  }
  return cap((withYear ? longYearFmt : longFmt).format(new Date(w.startsAt)));
}

/** Fila de base de datos → When. */
export function postWhen(p: {
  starts_at: string | null;
  ends_at: string | null;
  start_has_time: boolean;
  end_has_time: boolean;
}): When | null {
  return p.starts_at
    ? {
        startsAt: p.starts_at,
        endsAt: p.ends_at,
        startHasTime: p.start_has_time,
        endHasTime: p.end_has_time,
      }
    : null;
}
