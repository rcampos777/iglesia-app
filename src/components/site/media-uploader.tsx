"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { SITE_BUCKET } from "@/lib/site/media";
import { registerMediaAction } from "@/app/(app)/sitio-web/actions";

const MAX_LARGE = 1920;
const MAX_THUMB = 640;

async function resize(
  file: File,
  max: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  // createImageBitmap respeta la orientación EXIF. El iPhone convierte HEIC
  // a JPEG al elegir la foto porque `accept` no incluye HEIC.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo procesar"))),
      "image/jpeg",
      0.85,
    ),
  );
  return { blob, width, height };
}

function altFromName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Sube fotos al bucket `sitio`: las reduce en el navegador (grande 1920 px y
 * miniatura 640 px, JPEG) y registra cada una. El permiso lo valida el
 * bucket (RLS can_edit_site) y la acción del servidor.
 */
export function MediaUploader({
  onUploaded,
  multiple = true,
  label = "Subir fotos",
}: {
  onUploaded?: (ids: string[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList) {
    setBusy(true);
    setErrors([]);
    const supabase = createClient();
    const ids: string[] = [];
    const errs: string[] = [];
    const list = [...files];
    for (const [i, file] of list.entries()) {
      setStatus(`Subiendo ${i + 1} de ${list.length}…`);
      if (
        !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) &&
        !/\.(jpe?g|png|webp|heic)$/i.test(file.name)
      ) {
        errs.push(`${file.name}: no es una foto (JPG, PNG o WebP).`);
        continue;
      }
      try {
        const [large, thumb] = await Promise.all([
          resize(file, MAX_LARGE),
          resize(file, MAX_THUMB),
        ]);
        const id = crypto.randomUUID();
        const year = new Date().getFullYear();
        const storagePath = `${year}/${id}.jpg`;
        const thumbPath = `${year}/${id}-t.jpg`;
        for (const [path, blob] of [
          [storagePath, large.blob],
          [thumbPath, thumb.blob],
        ] as const) {
          const { error } = await supabase.storage.from(SITE_BUCKET).upload(path, blob, {
            contentType: "image/jpeg",
            cacheControl: "31536000",
            upsert: false,
          });
          if (error) throw new Error(error.message);
        }
        const res = await registerMediaAction({
          storagePath,
          thumbPath,
          alt: altFromName(file.name),
          width: large.width,
          height: large.height,
        });
        if (res.ok) ids.push(res.data.id);
        else errs.push(`${file.name}: ${res.error}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        errs.push(
          `${file.name}: ${/row-level|policy|Unauthorized|403/i.test(msg) ? "no tienes permiso para subir fotos." : "no se pudo subir. Revisa la conexión e intenta de nuevo."}`,
        );
      }
    }
    setBusy(false);
    setStatus(
      ids.length
        ? `${ids.length} foto${ids.length === 1 ? "" : "s"} subida${ids.length === 1 ? "" : "s"}.`
        : null,
    );
    setErrors(errs);
    if (ids.length) onUploaded?.(ids);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        className="hidden"
        onChange={(e) => e.target.files?.length && void upload(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ImagePlus className="size-4" aria-hidden />
        )}
        {label}
      </Button>
      {status ? (
        <p className="text-muted-foreground text-sm" role="status">
          {status}
        </p>
      ) : null}
      {errors.length ? (
        <ul className="text-destructive space-y-0.5 text-sm" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
