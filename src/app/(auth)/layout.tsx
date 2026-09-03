import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-12" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Ciudad de Avivamiento</h1>
            <p className="text-muted-foreground text-sm">
              Ponce · Administración de la congregación
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
