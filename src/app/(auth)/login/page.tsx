import Link from "next/link";
import { LoginForm } from "./login-form";
import { PRIVACY_PATH } from "@/lib/privacy";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; next?: string; error?: string; cuenta?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-4">
      {params.cuenta === "borrada" || params.cuenta === "revision" ? (
        <p role="status" className="bg-card rounded-lg border p-3 text-sm">
          {params.cuenta === "borrada"
            ? "Tu perfil se borró. Gracias por haber sido parte."
            : "Tu cuenta se borró. Tus registros de donaciones o certificaciones se conservan por obligaciones legales y un pastor general revisará tu solicitud."}
        </p>
      ) : null}
      <LoginForm resetOk={params.reset === "ok"} next={params.next} authError={params.error} />
      <p className="text-muted-foreground text-center text-sm">
        ¿Primera vez?{" "}
        <Link href="/registro" className="text-foreground font-medium hover:underline">
          Crea tu cuenta
        </Link>
      </p>
      <p className="text-muted-foreground text-center text-xs">
        <Link href={PRIVACY_PATH} className="hover:underline">
          Aviso de privacidad
        </Link>
      </p>
    </div>
  );
}
