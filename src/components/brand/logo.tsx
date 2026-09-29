import Image from "next/image";

/**
 * Logo oficial de Ciudad de Avivamiento | Ponce (archivos en
 * `public/brand/`, fondo transparente).
 *
 * El símbolo va sobre una baldosa clara: el edificio carbón del logo se
 * perdería sobre el fondo carbón del menú lateral.
 */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md bg-[var(--brand-warm-white)] p-1 ${className}`}
    >
      <Image
        src="/brand/logo-mark.png"
        alt="Ciudad de Avivamiento"
        width={256}
        height={256}
        className="size-full object-contain"
        priority
      />
    </span>
  );
}

/** Logo completo (símbolo + nombre + lema) para pantallas de acceso. */
export function LogoFull({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-full.png"
      alt="Ciudad de Avivamiento — Jesucristo es el Dios Todopoderoso"
      width={1250}
      height={828}
      className={`h-auto ${className}`}
      priority
    />
  );
}

/**
 * Logo con el nombre al lado. `tone` ajusta el color del texto según el
 * fondo: "sidebar" para el carbón del menú, "default" para fondos claros.
 */
export function Logo({
  tone = "default",
  className = "",
}: {
  tone?: "default" | "sidebar";
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-9" />
      <span className="flex flex-col leading-tight">
        <span
          className={
            tone === "sidebar"
              ? "text-sidebar-accent-foreground text-sm font-semibold tracking-tight"
              : "text-sm font-semibold tracking-tight"
          }
        >
          Ciudad de Avivamiento
        </span>
        <span
          className={
            tone === "sidebar"
              ? "text-sidebar-foreground text-[11px]"
              : "text-muted-foreground text-[11px]"
          }
        >
          Ponce
        </span>
      </span>
    </span>
  );
}
