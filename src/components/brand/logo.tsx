/**
 * Logo de Ciudad de Avivamiento | Ponce.
 *
 * ⚠️ PROVISIONAL — este monograma está construido en código, no es la
 * marca oficial de la iglesia. Se usa mientras llega el archivo real.
 * Para sustituirlo: coloca el SVG (o un PNG de al menos 1000 px de ancho
 * con fondo transparente) en `public/` y reemplaza el <svg> de
 * `LogoMark` por una <Image>. Ver docs/design.md §3.
 *
 * Al ser vectorial no se ve borroso ni deformado en ningún tamaño; el
 * viewBox cuadrado con `preserveAspectRatio` por defecto impide que se
 * estire.
 */

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Ciudad de Avivamiento"
      focusable="false"
    >
      <rect width="32" height="32" rx="4" fill="var(--brand-red)" />
      <text
        x="16"
        y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--brand-warm-white)"
        fontSize="13"
        fontWeight="700"
        letterSpacing="0.3"
        fontFamily="var(--font-sans), system-ui, sans-serif"
      >
        CA
      </text>
    </svg>
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
      <LogoMark className="size-8 shrink-0" />
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
