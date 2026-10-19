import Link from "next/link";
import { RegisterForm } from "./register-form";
import { enabledOAuthProviders } from "@/lib/auth/oauth";

export default function RegisterPage() {
  return (
    <div className="space-y-4">
      <RegisterForm providers={enabledOAuthProviders()} />
      <p className="text-muted-foreground text-center text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-foreground font-medium hover:underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
