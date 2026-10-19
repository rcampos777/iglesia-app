"use client";

import { useActionState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import { uploadDonationFileAction } from "./actions";

const initial: ActionResult = { ok: true, data: undefined };

export function UploadDonationsForm() {
  const [state, formAction, pending] = useActionState(uploadDonationFileAction, initial);
  return (
    <form action={formAction} className="space-y-4">
      {!state.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="file">Archivo (.xlsx o .csv)</Label>
        <Input
          id="file"
          name="file"
          type="file"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          disabled={pending}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="size-4" aria-hidden />
        )}
        {pending ? "Analizando…" : "Subir y analizar"}
      </Button>
    </form>
  );
}
