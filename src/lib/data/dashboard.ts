import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isStaff, type CurrentUser } from "@/lib/auth/session";

export interface DashboardCount {
  label: string;
  value: number | null;
}

/**
 * Conteos del panel. Si la base de datos no está disponible (por
 * ejemplo, en un entorno sin credenciales configuradas todavía), se
 * devuelve `value: null` por cada tarjeta en vez de romper la página.
 */
export async function getDashboardCounts(user: CurrentUser | null): Promise<DashboardCount[]> {
  if (!user) return [];

  const supabase = await createClient();

  const countQuery = async (label: string, run: () => PromiseLike<{ count: number | null }>) => {
    try {
      const { count } = await run();
      return { label, value: count ?? 0 };
    } catch {
      return { label, value: null };
    }
  };

  if (!isStaff(user)) {
    return Promise.all([
      countQuery("Mis cursos", () =>
        supabase
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("person_id", user.personId ?? ""),
      ),
      countQuery("Mis actividades", () =>
        supabase
          .from("activity_participants")
          .select("id", { count: "exact", head: true })
          .eq("person_id", user.personId ?? ""),
      ),
      countQuery("Ministerios donde sirvo", () =>
        supabase
          .from("ministry_memberships")
          .select("id", { count: "exact", head: true })
          .eq("person_id", user.personId ?? "")
          .is("left_at", null),
      ),
    ]);
  }

  return Promise.all([
    countQuery("Personas registradas", () =>
      supabase.from("people").select("id", { count: "exact", head: true }),
    ),
    countQuery("Visitantes en seguimiento", () =>
      supabase
        .from("visitor_follow_ups")
        .select("id", { count: "exact", head: true })
        .in("status", ["pendiente", "en_progreso"]),
    ),
    countQuery("Ministerios activos", () =>
      supabase
        .from("ministries")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ),
    countQuery("Actividades próximas", () =>
      supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .in("status", ["planificada", "abierta"]),
    ),
    countQuery("Clases activas", () =>
      supabase
        .from("class_offerings")
        .select("id", { count: "exact", head: true })
        .eq("status", "activa"),
    ),
    countQuery("Peticiones de oración abiertas", () =>
      supabase
        .from("prayer_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["nueva", "en_oracion"]),
    ),
  ]);
}
