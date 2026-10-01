"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { deletePersonAction } from "@/app/(app)/personas/actions";

const BLOCKER_LABELS: Record<string, string> = {
  matriculas: "matrícula(s) en clases",
  asistencia_clases: "asistencia(s) a clases",
  maestro_de_clases: "clase(s) donde es maestro",
  ministerios: "ministerio(s) donde sirve",
  lider_de_ministerios: "ministerio(s) donde es líder",
  actividades: "actividad(es)",
  responsable_de_actividades: "actividad(es) donde es responsable",
  inscripciones: "inscripción(es) en línea",
  asistencia_cultos: "asistencia(s) a cultos",
  seguimiento: "seguimiento(s) de visitante",
  peticiones_oracion: "petición(es) de oración",
  donaciones: "donación(es)",
  cartas_donativos: "carta(s) de donativos",
  certificaciones: "certificación(es)",
  encuestas: "respuesta(s) de encuestas",
};

/** Solo SuperAdmin. Borra a una persona creada por error y su cuenta. */
export function DeletePersonCard({
  personId,
  personName,
  blockers,
}: {
  personId: string;
  personName: string;
  blockers: Record<string, number>;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entries = Object.entries(blockers);
  const blocked = entries.length > 0;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await deletePersonAction(personId, reason);
      if (res.ok) {
        router.push("/personas");
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("No hubo respuesta del servidor. Revisa la conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle className="text-base">Borrar persona</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {blocked ? (
          <>
            <p className="text-muted-foreground">
              No se puede borrar porque tiene registros en la app. Solo se borran personas creadas
              por error, sin nada ligado:
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {entries.map(([key, n]) => (
                <li key={key}>
                  {n} {BLOCKER_LABELS[key] ?? "otro(s) registro(s)"}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              No tiene nada ligado. Se borran la persona y su cuenta de acceso (si tiene). No se
              puede deshacer; queda anotado en la bitácora con el motivo.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="delete-reason">Motivo</Label>
              <Textarea
                id="delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Ej.: registro duplicado creado por error"
                disabled={busy}
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || reason.trim().length < 5}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                  Borrar persona
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Borrar a {personName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borran la persona y su cuenta de acceso. No se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Borrar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        {error ? (
          <p className="text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
