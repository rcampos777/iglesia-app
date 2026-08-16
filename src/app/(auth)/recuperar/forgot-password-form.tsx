"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const [, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const result = await forgotPasswordAction(formData);
      setSubmitted(true);
      return result;
    },
    initialState,
  );

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revisa tu email</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Si el email está registrado, te enviamos un enlace para restablecer tu contraseña.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link href="/login">Volver a iniciar sesión</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Enviando..." : "Enviar enlace"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
