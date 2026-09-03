import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-12" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Ciudad de Avivamiento Ponce</h1>
            {/* Mismo tamaño que el título, a pedido del usuario: aquí la
                jerarquía la marcan el peso y el color, no el tamaño. */}
            <p className="text-muted-foreground text-xl font-medium tracking-tight">
              Administración de la Congregación
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
