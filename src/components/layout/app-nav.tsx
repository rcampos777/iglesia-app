"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { logoutAction } from "@/app/(auth)/actions";
import type { NavItem } from "@/lib/auth/nav-items";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppNav({ items, userLabel }: { items: NavItem[]; userLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Barra superior móvil */}
      <header className="bg-sidebar border-sidebar-border sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 md:hidden">
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
            className="bg-sidebar border-sidebar-border text-sidebar-foreground w-72 p-4"
          >
            <SheetTitle className="mb-4">
              <Logo tone="sidebar" />
            </SheetTitle>
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
            <div className="border-sidebar-border mt-6 border-t pt-4">
              <p className="text-sidebar-foreground mb-2 truncate text-xs">{userLabel}</p>
              <form action={logoutAction}>
                <Button variant="outline" size="sm" className="w-full" type="submit">
                  <LogOut className="mr-2 size-4" />
                  Cerrar sesión
                </Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Sidebar escritorio */}
      <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 hidden w-60 flex-col border-r p-4 md:flex">
        <Logo tone="sidebar" className="mb-6 px-1" />
        <NavLinks items={items} />
        <div className="border-sidebar-border mt-auto border-t pt-4">
          <p className="text-sidebar-foreground mb-2 truncate px-2 text-xs">{userLabel}</p>
          <form action={logoutAction}>
            <Button variant="outline" size="sm" className="w-full" type="submit">
              <LogOut className="mr-2 size-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </aside>
    </>
  );
}
