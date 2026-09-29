"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/sitio", label: "Inicio" },
  { href: "/sitio#nosotros", label: "Nosotros" },
  { href: "/sitio/eventos", label: "Eventos" },
  { href: "/sitio/videos", label: "Predicaciones" },
  { href: "/sitio/albumes", label: "Álbumes" },
  { href: "/sitio#contacto", label: "Contacto" },
];

function Brand({ name }: { name: string }) {
  return (
    <Link href="/sitio" className="flex items-center gap-3" aria-label={`${name}, inicio`}>
      <Image
        src="/brand/logo-mark.png"
        alt=""
        width={46}
        height={46}
        className="size-[46px] rounded-xl bg-[#F5F0E8] p-1"
      />
      <span className="text-[17px] leading-5 text-white">{name}</span>
    </Link>
  );
}

/** Encabezado con menú a pantalla completa (mismo en todas las páginas). */
export function SiteHeader({
  name,
  portalUrl,
  overlay = false,
}: {
  name: string;
  portalUrl: string;
  overlay?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "z-30 w-full",
          overlay ? "absolute inset-x-0 top-0" : "relative bg-[#1D191A]",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-[19px] pt-12 pb-4 md:px-8 md:pt-8">
          <Brand name={name} />
          <nav aria-label="Principal" className="hidden items-center gap-7 lg:flex">
            {LINKS.slice(1).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[15px] text-white/80 transition hover:text-white"
              >
                {l.label}
              </Link>
            ))}
            <a
              href={portalUrl}
              className="rounded-full bg-[#F1E5C6] px-5 py-2.5 text-[15px] font-medium text-[#1D191A] transition hover:bg-white"
            >
              Portal
            </a>
          </nav>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={open}
            className="flex h-11 w-11 flex-col items-end justify-center gap-[7px] rounded-lg lg:hidden"
          >
            <span className="h-[2px] w-7 rounded bg-white" />
            <span className="h-[2px] w-7 rounded bg-white" />
            <span className="h-[2px] w-4 rounded bg-white" />
          </button>
        </div>
      </header>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          className="site-fade-fast fixed inset-0 z-[100] flex flex-col bg-[#1D191A] px-[19px] pt-12 pb-9"
        >
          <div className="flex items-center justify-between">
            <Brand name={name} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
              className="relative h-11 w-11 rounded-lg"
              autoFocus
            >
              <span className="absolute top-1/2 left-1/2 h-[2px] w-7 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded bg-white" />
              <span className="absolute top-1/2 left-1/2 h-[2px] w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded bg-white" />
            </button>
          </div>
          <nav aria-label="Menú" className="mt-14 flex flex-col gap-[22px]">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-[36px] leading-tight font-light tracking-[-0.8px] text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto grid gap-3">
            <a
              href={portalUrl}
              className="flex h-[52px] items-center justify-between rounded-full bg-[#F1E5C6] px-6 text-[21px] font-medium text-[#1D191A]"
            >
              Portal de miembros
              <ArrowUpRight className="size-6" aria-hidden />
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
