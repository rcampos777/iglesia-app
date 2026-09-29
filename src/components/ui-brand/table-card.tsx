import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Contenedor de tablas y listas: tarjeta blanca con borde fino. El
 * desplazamiento horizontal (si una tabla no cabe) queda contenido aquí
 * y nunca desborda la página.
 */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-card ring-foreground/10 overflow-hidden rounded-xl shadow-xs ring-1",
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** Estado vacío con icono y texto; nunca depende solo del color. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {Icon ? (
        <span className="bg-secondary text-muted-foreground mb-1 flex size-10 items-center justify-center rounded-full">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="text-muted-foreground max-w-sm text-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
