"use client";

import { useActionState, useState } from "react";
import {
  invitePersonToPortalAction,
  revokePortalInvitationAction,
  type InvitePortalResult,
} from "@/app/(app)/personas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import type { PendingPortalInvitation } from "@/lib/data/portal-invitations";

const initialState: ActionResult<InvitePortalResult> = { ok: true, data: undefined as never };

export function InvitePortalCard({
  personId,
  defaultEmail,
  hasAccount,
  pendingInvitation,
}: {
  personId: string;
  defaultEmail: string | null;
  hasAccount: boolean;
  pendingInvitation: PendingPortalInvitation | null;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<InvitePortalResult>, formData: FormData) => {
      const result = await invitePersonToPortalAction(personId, formData);
      if (result.ok) {
        setLink(`${result.data.appUrl}/activar-portal?token=${result.data.token}`);
      }
      return result;
    },
    initialState,
  );
  const [isRevoking, setIsRevoking] = useState(false);

  if (hasAccount) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portal del miembro</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Esta persona ya tiene una cuenta de portal activa.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitar al portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!state.ok && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        {link ? (
          <div className="space-y-2">
            <Alert>
              <AlertDescription>
                Comparte este enlace de forma segura (WhatsApp, en persona). Vence en 7 días y solo
                se puede usar una vez.
              </AlertDescription>
            </Alert>
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </div>
        ) : pendingInvitation ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Invitación pendiente para <strong>{pendingInvitation.email}</strong>, creada el{" "}
              {new Date(pendingInvitation.createdAt).toLocaleDateString("es")}. Vence el{" "}
              {new Date(pendingInvitation.expiresAt).toLocaleDateString("es")}.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={isRevoking}
              onClick={async () => {
                setIsRevoking(true);
                await revokePortalInvitationAction(personId, pendingInvitation.id);
                setIsRevoking(false);
              }}
            >
              {isRevoking ? "Revocando..." : "Revocar invitación"}
            </Button>
            <p className="text-muted-foreground text-xs">
              O genera una nueva abajo: reemplaza automáticamente la pendiente.
            </p>
          </div>
        ) : null}

        <form action={formAction} className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="invite-email">Email para la invitación</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              defaultValue={defaultEmail ?? ""}
              required
            />
            {!state.ok && state.fieldErrors?.email && (
              <p className="text-destructive text-sm">{state.fieldErrors.email[0]}</p>
            )}
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Generando..." : pendingInvitation ? "Regenerar enlace" : "Generar enlace"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
