"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Globe,
  HandCoins,
  HandHeart,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Settings,
  Upload,
  UserPlus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { logoutAction } from "@/app/(auth)/actions";
import type { NavItem } from "@/lib/auth/nav-items";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

// Presentación del menú (icono y grupo por ruta). Qué enlaces ve cada
// usuario lo decide `visibleNavItems` en el servidor; aquí solo se
// agrupan los que llegan.
const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/portal": UserRound,
  "/personas": Users,
  "/visitantes": UserPlus,
  "/ministerios": HeartHandshake,
  "/check-in": QrCode,
  "/cursos": BookOpen,
  "/actividades": CalendarDays,
  "/encuestas": ClipboardList,
  "/oracion": HandHeart,
  "/reportes": BarChart3,
  "/importar": Upload,
  "/finanzas": HandCoins,
  "/sitio-web": Globe,
  "/admin": Settings,
};

const GROUPS: { label: string | null; hrefs: string[] }[] = [
  { label: null, hrefs: ["/dashboard", "/portal"] },
  { label: "Congregación", hrefs: ["/personas", "/visitantes", "/ministerios", "/check-in"] },
  { label: "Formación y eventos", hrefs: ["/cursos", "/actividades", "/encuestas"] },
  { label: "Cuidado pastoral", hrefs: ["/oracion"] },
  { label: "Gestión", hrefs: ["/finanzas", "/sitio-web", "/reportes", "/importar", "/admin"] },
];

function groupItems(items: NavItem[]) {
  const byHref = new Map(items.map((i) => [i.href, i]));
  const used = new Set<string>();
  const groups = GROUPS.map((g) => ({
    label: g.label,
    items: g.hrefs.flatMap((h) => {
      const item = byHref.get(h);
      if (!item) return [];
      used.add(h);
      return [item];
    }),
  })).filter((g) => g.items.length > 0);
  // Cualquier ruta nueva sin grupo asignado igual aparece, al final.
  const rest = items.filter((i) => !used.has(i.href));
  if (rest.length > 0) groups.push({ label: "Otros", items: rest });
  return groups;
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menú principal" className="flex flex-col gap-5">
      {groupItems(items).map((group) => (
        <div key={group.label ?? "inicio"} className="flex flex-col gap-0.5">
          {group.label ? (
            <p className="text-sidebar-foreground/70 px-3 pb-1 text-xs font-medium tracking-wide uppercase">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = ICONS[item.href] ?? LayoutDashboard;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-sidebar-foreground focus-visible:ring-offset-sidebar flex items-center gap-3 rounded-md px-3 py-2 text-[15px] transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AccountFooter({ userLabel }: { userLabel: string }) {
  return (
    <div className="border-sidebar-border shrink-0 border-t pt-4">
      <p className="text-sidebar-foreground mb-2 truncate px-1 text-sm" title={userLabel}>
        {userLabel}
      </p>
      <form action={logoutAction}>
        <Button variant="outline" size="sm" className="w-full" type="submit">
          <LogOut className="size-4" aria-hidden />
          Cerrar sesión
        </Button>
      </form>
    </div>
  );
}

export function AppNav({ items, userLabel }: { items: NavItem[]; userLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Barra superior móvil */}
      <header className="bg-sidebar border-sidebar-border sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 lg:hidden">
        <Logo tone="sidebar" />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Abrir menú"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="bg-sidebar border-sidebar-border text-sidebar-foreground flex w-72 flex-col gap-0 p-4"
          >
            <SheetTitle className="mb-5 shrink-0">
              <Logo tone="sidebar" />
            </SheetTitle>
            {/* El área de enlaces se desplaza sola: en pantallas bajas el
                cierre de sesión sigue visible abajo. */}
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-4">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </div>
            <AccountFooter userLabel={userLabel} />
          </SheetContent>
        </Sheet>
      </header>

      {/* Sidebar escritorio */}
      <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 hidden w-64 flex-col border-r p-4 lg:flex">
        <Link
          href="/dashboard"
          className="focus-visible:ring-sidebar-foreground mb-6 shrink-0 rounded-md px-1 focus-visible:ring-2 focus-visible:outline-none"
        >
          <Logo tone="sidebar" />
        </Link>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-4">
          <NavLinks items={items} />
        </div>
        <AccountFooter userLabel={userLabel} />
      </aside>
    </>
  );
}
