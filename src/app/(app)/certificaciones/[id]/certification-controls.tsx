"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteCertificationAction } from "../actions";

export function OpenFileButton({ id }: { id: string }) {
  // Enlace normal (no <Link>): sin prefetch, porque abrirlo queda en la bitácora.
  return (
    <Button asChild variant="outline">
      <a href={`/certificaciones/${id}/documento`} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="size-4" aria-hidden />
        Ver documento
      </a>
    </Button>
  );
}

export function DeleteCertificationButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await deleteCertificationAction(id);
      if (res.ok) {
        router.push("/certificaciones");
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("No se pudo borrar. Revisa la conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost" className="text-destructive" disabled={busy}>
            <Trash2 className="size-4" aria-hidden />
            Borrar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta certificación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran el registro y su documento. No se puede deshacer; queda anotado en la
              bitácora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
