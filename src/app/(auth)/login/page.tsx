import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-4">
      <LoginForm resetOk={params.reset === "ok"} next={params.next} authError={params.error} />
      <p className="text-muted-foreground text-center text-sm">
        ¿Primera vez?{" "}
        <Link href="/registro" className="text-foreground font-medium hover:underline">
          Crea tu cuenta
        </Link>
      </p>
    </div>
  );
}
