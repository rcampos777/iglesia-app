"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/finanzas", label: "Donaciones" },
  { href: "/finanzas/nueva", label: "Registrar" },
  { href: "/finanzas/cartas", label: "Cartas" },
  { href: "/finanzas/configuracion", label: "Configuración" },
];

export function FinanceTabs({ showAccess }: { showAccess: boolean }) {
  const pathname = usePathname();
  const tabs = showAccess ? [...TABS, { href: "/finanzas/acceso", label: "Acceso" }] : TABS;
  const active = (href: string) =>
    href === "/finanzas"
      ? pathname === "/finanzas" ||
        /^\/finanzas\/(?!nueva|cartas|configuracion|acceso)/.test(pathname)
      : pathname.startsWith(href);
  return (
    <nav
      aria-label="Secciones de finanzas"
      className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="bg-muted inline-flex min-w-full gap-1 rounded-lg p-1 sm:min-w-0">
        {tabs.map((t) => (
          <li key={t.href} className="flex-1 sm:flex-none">
            <Link
              href={t.href}
              aria-current={active(t.href) ? "page" : undefined}
              className={cn(
                "block rounded-md px-3 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors",
                active(t.href)
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
