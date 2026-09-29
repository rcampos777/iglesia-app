import type { ReactNode } from "react";

/**
 * Encabezado estándar de página: título (24 px móvil / 28 px desde md),
 * descripción opcional y acciones a la derecha (debajo en móvil).
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <p className="text-muted-foreground text-sm font-medium">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">{title}</h1>
        {description ? <p className="text-muted-foreground text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div> : null}
    </div>
  );
}
