import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Iglesia App</h1>
          <p className="text-muted-foreground text-sm">Administración de la congregación</p>
        </div>
        {children}
      </div>
    </div>
  );
}
