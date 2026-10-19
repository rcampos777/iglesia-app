"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Loader2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseMemberTable } from "@/lib/people/ministry-import-parse";
import { createMinistryImportAction } from "../../actions";

/** Sube la lista (CSV), la interpreta aquí y la manda al staging. */
export function UploadList({ ministryId }: { ministryId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      if (file.size > 2_000_000) throw new Error("El archivo es muy grande (máximo 2 MB).");
      const text = await file.text();
      const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
      const table = parseMemberTable(parsed.data);
      if (!table.ok) throw new Error(table.error);
      const res = await createMinistryImportAction(ministryId, {
        fileName: file.name,
        rows: table.rows,
      });
      if (!res.ok) throw new Error(res.error);
      router.push(`/ministerios/${ministryId}/importar/${res.data.batchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="list-file">Archivo CSV</Label>
        <Input
          id="list-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={pending}
        />
        <p className="text-muted-foreground text-sm">
          Columnas: <strong>Nombre</strong>, Apellidos, <strong>Correo</strong>, Teléfono y Fecha de
          nacimiento (opcionales). Desde Excel: Archivo → Guardar como → CSV.
        </p>
      </div>
      <Button type="button" onClick={upload} disabled={!file || pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="size-4" aria-hidden />
        )}
        Ver vista previa
      </Button>
    </div>
  );
}
