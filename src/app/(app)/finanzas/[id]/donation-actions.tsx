"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, HandHeart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { readPrayerNoteAction, sharePrayerNoteAction, voidDonationAction } from "../actions";

export function VoidDonationButton({
  donationId,
  version,
}: {
  donationId: string;
  version: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await voidDonationAction(donationId, version, reason);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error);
    } catch {
      setError("No hubo respuesta del servidor. No se anuló; intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          Anular
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Anular donación</DialogTitle>
            <DialogDescription>
              No se borra: deja de contar en totales y cartas y queda en el historial con tu nombre,
              la fecha y el motivo. Las cartas emitidas que la incluyan se marcan para revisión.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Motivo</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej.: cheque devuelto"
              maxLength={300}
              required
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Volver
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={pending || reason.trim().length < 5}
            >
              {pending ? "Anulando…" : "Anular donación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Note = {
  content: string;
  shared: boolean;
  shareAuthorizedAt: string | null;
  shareAuthorizedBy: string | null;
};

/**
 * La petición del sobre NO se carga con la página: solo al tocar "Ver",
 * y cada lectura queda registrada (donation_prayer_note_access_log).
 */
export function PrayerNotePanel({ donationId }: { donationId: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  async function reveal() {
    setPending(true);
    setError(null);
    try {
      const res = await readPrayerNoteAction(donationId);
      if (res.ok) setNote(res.data);
      else setError(res.error);
    } catch {
      setError("No hubo respuesta del servidor.");
    } finally {
      setPending(false);
    }
  }

  async function share() {
    setPending(true);
    setError(null);
    try {
      const res = await sharePrayerNoteAction(donationId, authorized);
      if (res.ok) {
        setShareMsg(
          res.data.status === "ya_compartida"
            ? "Ya estaba compartida con intercesión."
            : "Compartida con intercesión (solo el texto y el nombre).",
        );
        setNote((n) => (n ? { ...n, shared: true } : n));
      } else setError(res.error);
    } catch {
      setError("No hubo respuesta del servidor. Intenta de nuevo: no se duplicará.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="peticion-sobre"
      className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 shadow-xs ring-1 sm:p-5"
    >
      <h2 id="peticion-sobre" className="flex items-center gap-2 text-base font-semibold">
        <HandHeart className="text-muted-foreground size-[18px]" aria-hidden />
        Petición de oración del sobre
      </h2>
      {!note ? (
        <>
          <p className="text-muted-foreground text-sm">
            Confidencial. Al verla, tu lectura queda registrada.
          </p>
          <Button variant="outline" onClick={reveal} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
            Ver petición
          </Button>
        </>
      ) : (
        <>
          <p className="bg-muted/50 rounded-lg p-3 text-[15px] whitespace-pre-wrap">
            {note.content}
          </p>
          {note.shared ? (
            <p className="text-muted-foreground text-sm">
              {shareMsg ?? "Compartida con intercesión"}
              {note.shareAuthorizedBy
                ? ` · autorización registrada por ${note.shareAuthorizedBy}`
                : ""}
              {note.shareAuthorizedAt
                ? ` el ${new Date(note.shareAuthorizedAt).toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico" })}`
                : ""}
              .
            </p>
          ) : (
            <div className="space-y-2 border-t pt-3">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={authorized}
                  onCheckedChange={(v) => setAuthorized(v === true)}
                  className="mt-0.5"
                />
                Confirmo que la persona autorizó compartir su petición con el equipo de intercesión.
                Quedará registrado que yo lo indiqué.
              </label>
              <Button onClick={share} disabled={pending || !authorized}>
                Compartir con intercesión
              </Button>
              <p className="text-muted-foreground text-xs">
                Se comparte solo el texto y el nombre de la persona; nunca la cantidad ni la forma
                de pago.
              </p>
            </div>
          )}
        </>
      )}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
