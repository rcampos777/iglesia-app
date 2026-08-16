"use client";

import { useActionState } from "react";
import { uploadImportAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";

const initialState: ActionResult = { ok: true, data: undefined };

export function UploadForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => uploadImportAction(formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="file">Archivo CSV</Label>
        <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
        <p className="text-muted-foreground text-xs">
          Columnas esperadas: nombre, apellido, email, teléfono, fecha de nacimiento, género,
          dirección, ciudad, estatus. Ver plantilla en docs/import-process.md.
        </p>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Subiendo..." : "Subir y analizar"}
      </Button>
    </form>
  );
}
