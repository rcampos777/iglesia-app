"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PersonPicker, type PickedPerson } from "@/components/finance/person-picker";
import { createClient } from "@/lib/supabase/client";
import {
  CERTIFICATION_BUCKET,
  CERTIFICATION_FILE_TYPES,
  CERTIFICATION_MAX_BYTES,
} from "@/lib/certifications";
import { saveCertificationAction } from "@/app/(app)/certificaciones/actions";

type Initial = {
  person: PickedPerson | null;
  typeId: string;
  issuedOn: string;
  expiresOn: string;
  notes: string;
  fileName: string | null;
};

export function CertificationForm({
  certificationId,
  types,
  initial,
}: {
  certificationId?: string;
  types: { id: string; name: string }[];
  initial?: Initial;
}) {
  const router = useRouter();
  const [person, setPerson] = useState<PickedPerson | null>(initial?.person ?? null);
  const [typeId, setTypeId] = useState(initial?.typeId ?? "");
  const [issuedOn, setIssuedOn] = useState(initial?.issuedOn ?? "");
  const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(certificationId);
  const existingFile = !removeFile ? initial?.fileName : null;

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!CERTIFICATION_FILE_TYPES[f.type]) {
      return setError("El archivo debe ser PDF o una foto (JPG, PNG o WebP).");
    }
    if (f.size > CERTIFICATION_MAX_BYTES) return setError("El archivo no puede pasar de 10 MB.");
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!person) return setError("Elige la persona.");
    if (!typeId) return setError("Elige el tipo de certificación.");
    if (issuedOn && expiresOn && expiresOn < issuedOn) {
      return setError("La fecha de vencimiento no puede ser antes de la emisión.");
    }
    setSaving(true);
    try {
      let uploaded: { path: string; name: string } | null = null;
      if (file) {
        const ext = CERTIFICATION_FILE_TYPES[file.type]!;
        const path = `${person.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upError } = await createClient()
          .storage.from(CERTIFICATION_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upError) {
          setError("No se pudo subir el archivo. Revisa la conexión e intenta de nuevo.");
          return;
        }
        uploaded = { path, name: file.name.slice(0, 200) };
      }
      const res = await saveCertificationAction({
        id: certificationId,
        personId: person.id,
        typeId,
        issuedOn,
        expiresOn,
        notes,
        file: uploaded,
        removeFile: removeFile && !uploaded,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/certificaciones/${res.data.id}?guardada=1`);
      router.refresh();
    } catch {
      setError("No hubo respuesta del servidor. Revisa la conexión e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="bg-card ring-foreground/10 space-y-5 rounded-xl p-4 shadow-xs ring-1 sm:p-6"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="cert-person">Persona</Label>
        {editing ? (
          <p className="bg-muted/50 rounded-md border px-3 py-2 text-[15px] font-medium">
            {person?.name}
          </p>
        ) : (
          <PersonPicker id="cert-person" value={person} onChange={setPerson} disabled={saving} />
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cert-type">Tipo de certificación</Label>
        <Select value={typeId} onValueChange={setTypeId} disabled={saving}>
          <SelectTrigger id="cert-type" className="w-full">
            <SelectValue placeholder="Elige el tipo" />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cert-issued">Fecha de emisión</Label>
          <Input
            id="cert-issued"
            type="date"
            value={issuedOn}
            onChange={(e) => setIssuedOn(e.target.value)}
            disabled={saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-expires">Fecha de vencimiento</Label>
          <Input
            id="cert-expires"
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            disabled={saving}
            aria-describedby="cert-expires-help"
          />
          <p id="cert-expires-help" className="text-muted-foreground text-sm">
            Déjala vacía si el documento no vence.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cert-file">Documento (PDF o foto, hasta 10 MB)</Label>
        {existingFile && !file ? (
          <div className="bg-muted/50 flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <FileText className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{existingFile}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRemoveFile(true)}
              disabled={saving}
            >
              <X className="size-4" aria-hidden />
              Quitar
            </Button>
          </div>
        ) : null}
        <Input
          id="cert-file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          disabled={saving}
        />
        {existingFile && !file ? (
          <p className="text-muted-foreground text-sm">
            Si eliges otro archivo, reemplaza al actual.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cert-notes">Notas</Label>
        <Textarea
          id="cert-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={3}
          disabled={saving}
          placeholder="Ej.: número de certificado, para qué ministerio se pidió…"
        />
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          {saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar certificación"}
        </Button>
      </div>
    </form>
  );
}
