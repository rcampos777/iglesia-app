"use client";

import { useActionState } from "react";
import { completeProfileAction, logoutAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import { PrivacySummary } from "@/components/privacy/privacy-summary";

const initialState: ActionResult = { ok: true, data: undefined };

export function CompleteProfileForm({
  defaults,
  next,
  email,
  needsPrivacy,
}: {
  defaults: { firstName: string; lastName: string };
  next: string;
  email: string | null;
  needsPrivacy: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => completeProfileAction(formData),
    initialState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Completa tu perfil</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4 text-sm">
          Antes de entrar, confirma cómo te llamas para que la iglesia pueda reconocerte.
          {email ? (
            <>
              {" "}
              Cuenta: <span className="text-foreground break-all">{email}</span>
            </>
          ) : null}
        </p>
        {!state.ok && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nombre</Label>
              <Input
                id="firstName"
                name="firstName"
                autoComplete="given-name"
                defaultValue={defaults.firstName}
                maxLength={80}
                required
                aria-invalid={errors?.firstName ? true : undefined}
                aria-describedby={errors?.firstName ? "firstName-error" : undefined}
              />
              {errors?.firstName && (
                <p id="firstName-error" className="text-destructive text-sm">
                  {errors.firstName[0]}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Apellido</Label>
              <Input
                id="lastName"
                name="lastName"
                autoComplete="family-name"
                defaultValue={defaults.lastName}
                maxLength={80}
                required
                aria-invalid={errors?.lastName ? true : undefined}
                aria-describedby={errors?.lastName ? "lastName-error" : undefined}
              />
              {errors?.lastName && (
                <p id="lastName-error" className="text-destructive text-sm">
                  {errors.lastName[0]}
                </p>
              )}
            </div>
          </div>
          {needsPrivacy && (
            <div className="bg-muted/50 space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">Sobre tus datos</p>
              <PrivacySummary />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="acceptPrivacy"
                  value="si"
                  required
                  className="accent-primary mt-0.5 size-4 shrink-0"
                  aria-invalid={errors?.acceptPrivacy ? true : undefined}
                  aria-describedby={errors?.acceptPrivacy ? "acceptPrivacy-error" : undefined}
                />
                <span>
                  He leído el aviso de privacidad y acepto que la iglesia guarde mis datos.
                </span>
              </label>
              {errors?.acceptPrivacy && (
                <p id="acceptPrivacy-error" className="text-destructive text-sm">
                  {errors.acceptPrivacy[0]}
                </p>
              )}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar y continuar"}
          </Button>
        </form>
        <form action={logoutAction} className="mt-2">
          <Button type="submit" variant="ghost" className="w-full">
            Salir
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
