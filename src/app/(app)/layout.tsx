import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { visibleNavItems } from "@/lib/auth/nav-items";
import { AppNav } from "@/components/layout/app-nav";
import { PrivacyGate } from "@/components/privacy/privacy-gate";
import { PRIVACY_VERSION } from "@/lib/privacy";

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

  // Aviso de privacidad (0049): hay que aceptar la versión vigente para
  // usar la app. Quien lo aceptó al crear la cuenta en /registro no lo ve
  // otra vez: se registra aquí.
  if (user.privacyVersion !== PRIVACY_VERSION) {
    let accepted = false;
    if (user.signupPrivacyVersion === PRIVACY_VERSION) {
      const { error } = await supabase.rpc("accept_privacy_notice", {
        p_version: PRIVACY_VERSION,
      });
      accepted = !error;
    }
    if (!accepted) return <PrivacyGate changed={user.privacyVersion !== null} />;
  }

  const { data: isPrayerReader } = await supabase.rpc("is_prayer_reader");

  const items = visibleNavItems(user.roles, { isPrayerReader: Boolean(isPrayerReader) });

  return (
    <div className="min-h-screen lg:pl-64">
      <AppNav items={items} userLabel={user.email ?? "Usuario"} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-10">
        {children}
      </main>
    </div>
  );
}
