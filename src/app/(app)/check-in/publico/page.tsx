import Link from "next/link";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { MyQrCode } from "../../portal/my-qr-code";

/**
 * Destino del antiguo QR fijo de la entrada. Ya no confirma asistencia:
 * la asistencia la confirma un ujier. Aquí la persona ve su QR personal
 * para mostrarlo en la puerta.
 */
export default async function PublicCheckinPage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Bienvenido</h1>
        <p className="text-muted-foreground">
          Tu asistencia la confirma un ujier en la entrada. Muéstrale este código o dile tu nombre.
        </p>
      </div>
      <section className="bg-card ring-foreground/10 rounded-xl p-5 shadow-xs ring-1">
        <h2 className="mb-2 flex items-center justify-center gap-2 font-semibold">
          <QrCode className="text-muted-foreground size-[18px]" aria-hidden />
          Tu código personal
        </h2>
        {user?.personId ? (
          <MyQrCode />
        ) : (
          <p className="text-muted-foreground text-center text-sm">
            Tu cuenta no tiene un perfil de persona asociado. Dile tu nombre al ujier.
          </p>
        )}
      </section>
      <div className="text-center">
        <Button asChild variant="ghost">
          <Link href="/portal">Ir a Mi portal</Link>
        </Button>
      </div>
    </div>
  );
}
