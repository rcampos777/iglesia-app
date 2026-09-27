"use client";

import { useActionState } from "react";
import { acceptPortalInvitationAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function ActivateForm({ token, defaultEmail }: { token: string; defaultEmail: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => acceptPortalInvitationAction(formData),
    initialState,
  );

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enlace incompleto</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Este enlace de activación no incluye un token válido. Pide al staff que te comparta el
            enlace completo.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activar tu portal</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-sm">
          Confirma tu email y crea una contraseña para activar tu cuenta.
        </p>
        {!state.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={defaultEmail}
              required
            />
            {!state.ok && state.fieldErrors?.email && (
              <p className="text-destructive text-sm">{state.fieldErrors.email[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
            {!state.ok && state.fieldErrors?.password && (
              <p className="text-destructive text-sm">{state.fieldErrors.password[0]}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
            />
            {!state.ok && state.fieldErrors?.confirmPassword && (
              <p className="text-destructive text-sm">{state.fieldErrors.confirmPassword[0]}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Activando..." : "Activar portal"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
