import { addDaysToDateKey, churchDateKey } from "@/lib/datetime";

export type ScheduleRule = { weekday: number; local_time: string; name: string };
export type Occurrence = {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  startHasTime?: boolean;
  endHasTime?: boolean;
  href?: string;
  kind: "culto" | "evento";
};

/** Próximos cultos (hora de PR) a partir de la programación semanal. */
export function upcomingServices(rules: ScheduleRule[], days = 21, now = new Date()): Occurrence[] {
  const today = churchDateKey(now);
  const out: Occurrence[] = [];
  for (let i = 0; i <= days; i++) {
    const date = addDaysToDateKey(today, i);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const r of rules) {
      if (r.weekday !== weekday) continue;
      // PR = UTC−4 todo el año.
      const startsAt = new Date(`${date}T${r.local_time.slice(0, 5)}:00-04:00`).toISOString();
      if (new Date(startsAt).getTime() > now.getTime() - 90 * 60_000) {
        out.push({ title: r.name, startsAt, kind: "culto" });
      }
    }
  }
  return out;
}
