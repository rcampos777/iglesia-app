import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { visibleNavItems } from "@/lib/auth/nav-items";
import { AppNav } from "@/components/layout/app-nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  // Segunda barrera además del middleware: si por algún motivo se
  // renderiza este layout sin sesión, no se muestra nada del área
  // autenticada.
  if (!user) {
    redirect("/login");
  }

  const items = visibleNavItems(user.roles);

  return (
    <div className="min-h-screen md:pl-60">
      <AppNav items={items} userLabel={user.email ?? "Usuario"} />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
