"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function LoginForm({
  resetOk,
  next,
  authError,
}: {
  resetOk: boolean;
  next?: string;
  /** Motivo con el que el callback de auth nos devolvió aquí. */
  authError?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => loginAction(formData),
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
      </CardHeader>
      <CardContent>
        {authError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              No pudimos validar el enlace del email. Puede que ya lo hayas usado, que haya
              expirado, o que lo hayas abierto en un navegador distinto al que usaste para
              registrarte. Si tu cuenta ya quedó confirmada, inicia sesión aquí normalmente; si no,
              pide un enlace nuevo desde{" "}
              <Link href="/recuperar" className="underline">
                recuperar contraseña
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        {resetOk && (
          <Alert className="mb-4">
            <AlertDescription>Contraseña actualizada. Ya puedes iniciar sesión.</AlertDescription>
          </Alert>
        )}
        {!state.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <form action={formAction} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            {!state.ok && state.fieldErrors?.email && (
              <p className="text-destructive text-sm">{state.fieldErrors.email[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link href="/recuperar" className="text-muted-foreground text-sm hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            {!state.ok && state.fieldErrors?.password && (
              <p className="text-destructive text-sm">{state.fieldErrors.password[0]}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
