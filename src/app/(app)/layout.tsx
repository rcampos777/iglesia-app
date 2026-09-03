import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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

  // El líder del ministerio de intercesión ve la bandeja de oración sin
  // tener el rol `intercesor` (ver 0020_prayer_access_scope.sql).
  const supabase = await createClient();
  const { data: isPrayerReader } = await supabase.rpc("is_prayer_reader");

  const items = visibleNavItems(user.roles, { isPrayerReader: Boolean(isPrayerReader) });

  return (
    <div className="min-h-screen md:pl-60">
      <AppNav items={items} userLabel={user.email ?? "Usuario"} />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
