import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isStaff, type CurrentUser } from "@/lib/auth/session";

export type DashboardCountKey =
  | "my_courses"
  | "my_activities"
  | "my_ministries"
  | "people"
  | "visitors"
  | "ministries"
  | "activities"
  | "classes"
  | "prayer";

export interface DashboardCount {
  key: DashboardCountKey;
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

  const countQuery = async (
    key: DashboardCountKey,
    label: string,
    run: () => PromiseLike<{ count: number | null }>,
  ): Promise<DashboardCount> => {
    try {
      const { count } = await run();
      return { key, label, value: count ?? 0 };
    } catch {
      return { key, label, value: null };
    }
  };

  if (!isStaff(user)) {
    return Promise.all([
      countQuery("my_courses", "Mis cursos", () =>
        supabase
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("person_id", user.personId ?? ""),
      ),
      countQuery("my_activities", "Mis actividades", () =>
        supabase
          .from("activity_participants")
          .select("id", { count: "exact", head: true })
          .eq("person_id", user.personId ?? ""),
      ),
      countQuery("my_ministries", "Ministerios donde sirvo", () =>
        supabase
          .from("ministry_memberships")
          .select("id", { count: "exact", head: true })
          .eq("person_id", user.personId ?? "")
          .is("left_at", null),
      ),
    ]);
  }

  return Promise.all([
    countQuery("people", "Personas registradas", () =>
      supabase.from("people").select("id", { count: "exact", head: true }),
    ),
    countQuery("visitors", "Visitantes en seguimiento", () =>
      supabase
        .from("visitor_follow_ups")
        .select("id", { count: "exact", head: true })
        .in("status", ["pendiente", "en_progreso"]),
    ),
    countQuery("ministries", "Ministerios activos", () =>
      supabase
        .from("ministries")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ),
    countQuery("activities", "Actividades próximas", () =>
      supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .in("status", ["planificada", "abierta"]),
    ),
    countQuery("classes", "Clases activas", () =>
      supabase
        .from("class_offerings")
        .select("id", { count: "exact", head: true })
        .eq("status", "activa"),
    ),
    countQuery("prayer", "Peticiones de oración abiertas", () =>
      supabase
        .from("prayer_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["nueva", "en_oracion"]),
    ),
  ]);
}
