"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/sitio-web", label: "General" },
  { href: "/sitio-web/fotos", label: "Fotos" },
  { href: "/sitio-web/albumes", label: "Álbumes" },
  { href: "/sitio-web/publicaciones", label: "Eventos y anuncios" },
  { href: "/sitio-web/videos", label: "Videos" },
  { href: "/sitio-web/ministerios", label: "Ministerios" },
  { href: "/sitio-web/equipo", label: "Equipo pastoral" },
];

export function SiteTabs() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/sitio-web" ? pathname === href : pathname.startsWith(href);
  return (
    <nav
      aria-label="Secciones del sitio web"
      className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="bg-muted inline-flex gap-1 rounded-lg p-1">
        {TABS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={active(t.href) ? "page" : undefined}
              className={cn(
                "block rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
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
