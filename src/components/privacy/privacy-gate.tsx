import { LogoFull } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PrivacySummary } from "./privacy-summary";
import { acceptPrivacyAction, logoutAction } from "@/app/(auth)/actions";

/**
 * Se muestra en lugar de la app cuando la cuenta no ha aceptado la versión
 * vigente del aviso de privacidad (primera vez o cuando el aviso cambia).
 */
export function PrivacyGate({ changed }: { changed: boolean }) {
  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <LogoFull className="mx-auto w-56" />
        <Card>
          <CardHeader>
            <h1 className="font-heading text-base leading-snug font-medium">
              {changed ? "Actualizamos el aviso de privacidad" : "Aviso de privacidad"}
            </h1>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm">
              Antes de continuar, lee cómo la iglesia usa y protege tus datos personales.
            </p>
            <PrivacySummary />
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <form action={acceptPrivacyAction} className="sm:flex-1">
                <Button type="submit" className="w-full">
                  Entendido, continuar
                </Button>
              </form>
              <form action={logoutAction}>
                <Button type="submit" variant="outline" className="w-full">
                  Salir
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
