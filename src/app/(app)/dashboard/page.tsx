import Link from "next/link";
import {
  HandCoins,
  BookOpen,
  CalendarDays,
  ChevronRight,
  HandHeart,
  HeartHandshake,
  Plus,
  QrCode,
  Upload,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui-brand/page-header";
import { ATTENDANCE_AREA_ROLES } from "@/lib/auth/attendance";
import { getCurrentUser, hasAnyRole, hasRole, isStaff, type CurrentUser } from "@/lib/auth/session";
import { visibleNavItems } from "@/lib/auth/nav-items";
import { createClient } from "@/lib/supabase/server";
import { getDashboardCounts, type DashboardCountKey } from "@/lib/data/dashboard";
import type { AppRole } from "@/types/database";

// A qué módulo lleva cada métrica. El enlace solo se muestra si ese
// módulo está en el menú del usuario (mismas reglas que la navegación).
const METRIC_META: Record<DashboardCountKey, { icon: LucideIcon; href: string }> = {
  my_courses: { icon: BookOpen, href: "/portal" },
  my_activities: { icon: CalendarDays, href: "/portal" },
  my_ministries: { icon: HeartHandshake, href: "/portal" },
  people: { icon: Users, href: "/personas" },
  visitors: { icon: UserPlus, href: "/visitantes" },
  ministries: { icon: HeartHandshake, href: "/ministerios" },
  activities: { icon: CalendarDays, href: "/actividades" },
  classes: { icon: BookOpen, href: "/cursos" },
  prayer: { icon: HandHeart, href: "/oracion" },
};

interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
  allowed: (user: CurrentUser) => boolean;
}

// Espejo exacto de los guards de cada página de destino (su propio
// redirect sigue siendo la barrera real, junto con RLS).
const PEOPLE_WRITE: AppRole[] = [
  "administrador",
  "pastor",
  "coordinador_ministerio",
  "seguimiento",
];
const COURSE_MANAGE: AppRole[] = ["administrador", "pastor", "coordinador_ministerio"];
const FOLLOWUP_AND_IMPORT: AppRole[] = ["administrador", "coordinador_ministerio", "seguimiento"];

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/personas/nueva",
    label: "Registrar persona",
    icon: Plus,
    allowed: (u) => hasAnyRole(u, PEOPLE_WRITE),
  },
  {
    href: "/visitantes/nuevo",
    label: "Nuevo seguimiento",
    icon: UserPlus,
    allowed: (u) => hasAnyRole(u, FOLLOWUP_AND_IMPORT),
  },
  {
    href: "/check-in",
    label: "Registrar asistencia",
    icon: QrCode,
    allowed: (u) => hasAnyRole(u, ATTENDANCE_AREA_ROLES),
  },
  {
    href: "/actividades/nueva",
    label: "Nueva actividad",
    icon: CalendarDays,
    allowed: (u) =>
      hasAnyRole(u, ["administrador", "coordinador_ministerio"]) || hasRole(u, "pastor"),
  },
  {
    href: "/cursos/clases/nueva",
    label: "Abrir una clase",
    icon: BookOpen,
    allowed: (u) => hasAnyRole(u, COURSE_MANAGE),
  },
  {
    href: "/importar",
    label: "Importar datos",
    icon: Upload,
    allowed: (u) => hasAnyRole(u, FOLLOWUP_AND_IMPORT),
  },
  {
    href: "/finanzas/nueva",
    label: "Registrar donación",
    icon: HandCoins,
    allowed: (u) => hasAnyRole(u, ["apostol", "finanzas"]),
  },
  { href: "/portal", label: "Mi portal", icon: UserRound, allowed: () => true },
];

function todayLabel() {
  const text = new Intl.DateTimeFormat("es-PR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Puerto_Rico",
  }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const [counts, { data: isPrayerReader }] = await Promise.all([
    getDashboardCounts(user),
    supabase.rpc("is_prayer_reader"),
  ]);
  const visibleHrefs = new Set(
    visibleNavItems(user.roles, { isPrayerReader: Boolean(isPrayerReader) }).map((i) => i.href),
  );
  const actions = QUICK_ACTIONS.filter((a) => a.allowed(user));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={todayLabel()}
        title="Panel"
        description={
          isStaff(user) ? "Resumen general de la congregación." : "Tu resumen en la iglesia."
        }
      />

      <section aria-labelledby="metricas">
        <h2 id="metricas" className="sr-only">
          Métricas
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {counts.map((item) => {
            const meta = METRIC_META[item.key];
            const Icon = meta.icon;
            const linked = visibleHrefs.has(meta.href);
            const body = (
              <>
                <span className="flex items-start justify-between">
                  <span className="bg-secondary text-foreground/80 flex size-9 items-center justify-center rounded-lg">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  {linked ? (
                    <ChevronRight className="text-muted-foreground size-4" aria-hidden />
                  ) : null}
                </span>
                <span className="mt-3 block text-2xl font-semibold tabular-nums">
                  {item.value ?? "—"}
                </span>
                <span className="text-muted-foreground block text-sm leading-snug">
                  {item.label}
                </span>
              </>
            );
            return (
              <li key={item.key}>
                {linked ? (
                  <Link
                    href={meta.href}
                    className="bg-card ring-foreground/10 hover:bg-accent/60 focus-visible:ring-ring block h-full rounded-xl p-4 shadow-xs ring-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="bg-card ring-foreground/10 h-full rounded-xl p-4 shadow-xs ring-1">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="acciones" className="space-y-3">
        <h2 id="acciones" className="text-lg font-semibold tracking-tight">
          Accesos rápidos
        </h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <li key={action.href}>
                <Link
                  href={action.href}
                  className="bg-card ring-foreground/10 hover:bg-accent/60 focus-visible:ring-ring flex items-center gap-3 rounded-lg px-4 py-3 text-[15px] font-medium ring-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Icon className="text-primary size-4 shrink-0" aria-hidden />
                  {action.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
