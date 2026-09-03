import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Insignia de estado con color semántico. Vive fuera de
 * `components/ui/` porque el core de shadcn no se edita a mano
 * (CLAUDE.md §9): esto envuelve el estilo, no modifica el componente.
 *
 * Los colores semánticos son deliberadamente distintos de la paleta de
 * marca: si "activo" fuera el verde grisáceo y "error" el rojo de marca,
 * un error se vería igual que un botón primario. Ver docs/design.md.
 *
 * El color nunca comunica solo: cada insignia lleva siempre su texto.
 */
export type StatusTone = "active" | "warning" | "tracking" | "error" | "idle" | "neutral";

const TONE_CLASSES: Record<StatusTone, string> = {
  active: "border-state-active/35 text-state-active bg-state-active/10",
  warning: "border-state-warning/35 text-state-warning bg-state-warning/10",
  tracking: "border-state-tracking/35 text-state-tracking bg-state-tracking/10",
  error: "border-state-error/35 text-state-error bg-state-error/10",
  idle: "border-state-idle/35 text-state-idle bg-state-idle/10",
  neutral: "border-border text-muted-foreground bg-transparent",
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
