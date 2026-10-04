"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteMyAccountAction } from "./actions";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteMyAccountAction, null);
  const [confirm, setConfirm] = useState("");

  return (
    <form action={action} className="space-y-3 text-sm">
      <p className="font-medium">Borrar mi perfil</p>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5">
        <li>Se borra tu cuenta y ya no podrás entrar con ella.</li>
        <li>
          Si no tienes historial en la iglesia, se borra todo tu registro. Si lo tienes (clases,
          asistencia, ministerios), se borran tu nombre, contacto, notas, peticiones de oración y
          respuestas de encuestas; queda la estadística sin tu nombre.
        </li>
        <li>
          Si tienes donaciones o certificaciones registradas, esos registros se conservan por
          obligaciones legales y contables, y un pastor general revisa tu solicitud.
        </li>
        <li>No se puede deshacer.</li>
      </ul>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-delete">Para confirmar, escribe BORRAR</Label>
        <Input
          id="confirm-delete"
          name="confirm"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={state && !state.ok ? true : undefined}
          aria-describedby={state && !state.ok ? "delete-account-error" : undefined}
          disabled={pending}
        />
      </div>
      {state && !state.ok ? (
        <p id="delete-account-error" className="text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="destructive"
        className="w-full"
        disabled={pending || confirm.trim() !== "BORRAR"}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-4" aria-hidden />
        )}
        Borrar mi perfil
      </Button>
    </form>
  );
}
