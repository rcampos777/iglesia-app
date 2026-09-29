import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  ServiceAttendanceEntry,
  ServiceScheduleSettingsRow,
  ServiceSeriesRuleRow,
  ServiceSeriesRow,
  ServiceWithState,
} from "@/types/database";
import { churchDateKey } from "@/lib/datetime";

/**
 * Respaldo del trabajo programado (pg_cron): crea las ocurrencias que
 * falten. Idempotente; si falla (p. ej. sin permiso) no bloquea la página.
 */
export async function ensureServiceOccurrences(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("ensure_service_occurrences");
}

export async function listServicesWithState(opts: {
  from?: string;
  to?: string;
}): Promise<ServiceWithState[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_services_with_state", {
    p_from: opts.from ?? null,
    p_to: opts.to ?? null,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getServiceWithState(id: string): Promise<ServiceWithState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_services_with_state", { p_service_id: id });
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

export async function listServiceAttendance(
  serviceId: string,
  includeVoided = false,
): Promise<ServiceAttendanceEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_service_attendance", {
    p_service_id: serviceId,
    p_include_voided: includeVoided,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type SeriesWithRule = {
  series: ServiceSeriesRow;
  current: ServiceSeriesRuleRow | null;
  upcoming: ServiceSeriesRuleRow | null;
  history: ServiceSeriesRuleRow[];
};

/** Series con su versión vigente hoy, una versión futura (si se programó) y el historial. */
export async function listSeriesWithRules(): Promise<SeriesWithRule[]> {
  const supabase = await createClient();
  const [{ data: series, error: e1 }, { data: rules, error: e2 }] = await Promise.all([
    supabase.from("service_series").select("*").order("created_at"),
    supabase.from("service_series_rules").select("*").order("effective_from"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const today = churchDateKey();
  return (series ?? []).map((s) => {
    const own = (rules ?? []).filter((r) => r.series_id === s.id);
    const current =
      own.find(
        (r) => r.effective_from <= today && (!r.effective_until || r.effective_until >= today),
      ) ?? null;
    const upcoming = own.find((r) => r.effective_from > today) ?? null;
    return { series: s, current, upcoming, history: own };
  });
}

export async function getScheduleSettings(): Promise<ServiceScheduleSettingsRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("service_schedule_settings").select("*").maybeSingle();
  return data;
}
