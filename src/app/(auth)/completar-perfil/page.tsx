import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { googleNameDefaults } from "@/lib/auth/oauth";
import { safeNext } from "@/lib/auth/safe-next";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { CompleteProfileForm } from "./complete-profile-form";

const PLACEHOLDER_FIRST_NAME = "Sin nombre";

/**
 * Paso obligatorio para cuentas de Google/Apple (0052). El layout de la
 * app y requireAuth() mandan aquí mientras profile_completed_at sea NULL;
 * si la persona sale sin terminar, vuelve a verlo en su próximo acceso.
 */
export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next ?? null, "/dashboard");

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.profileComplete) redirect(next);

  const supabase = await createClient();
  const [{ data: authData }, { data: person }] = await Promise.all([
    supabase.auth.getUser(),
    user.personId
      ? supabase
          .from("people")
          .select("first_name, last_name")
          .eq("id", user.personId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Lo que ya tenga la ficha (cuentas antiguas sin apellido) manda; si no,
  // el nombre de Google. De Apple no se toma nada.
  const google = authData.user ? googleNameDefaults(authData.user) : null;
  const personFirst =
    person && person.first_name !== PLACEHOLDER_FIRST_NAME ? person.first_name.trim() : "";
  const defaults = {
    firstName: personFirst || google?.firstName || "",
    lastName: person?.last_name?.trim() || google?.lastName || "",
  };

  return (
    <CompleteProfileForm
      defaults={defaults}
      next={next}
      email={user.email}
      needsPrivacy={user.privacyVersion !== PRIVACY_VERSION}
    />
  );
}
