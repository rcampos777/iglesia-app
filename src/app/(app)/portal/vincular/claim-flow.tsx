"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  requestIdentityReviewAction,
  startIdentityClaimAction,
  verifyIdentityClaimAction,
} from "./actions";

type Step = "datos" | "codigo" | "listo" | "revision" | "revision_enviada";

export function ClaimFlow({ reviewPending }: { reviewPending: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(reviewPending ? "revision_enviada" : "datos");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, next: Step) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "No se pudo completar.");
      else {
        setStep(next);
        if (next === "listo") router.refresh();
      }
    });
  }

  const errorBox = error ? (
    <Alert variant="destructive">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null;

  if (step === "listo") {
    return (
      <Alert>
        <CheckCircle2 className="size-4" aria-hidden />
        <AlertTitle>Listo: tu cuenta quedó vinculada a tu registro</AlertTitle>
        <AlertDescription>
          Ahora ves tu historial (ministerios, actividades, cursos) en Mi portal.
        </AlertDescription>
      </Alert>
    );
  }

  if (step === "revision_enviada") {
    return (
      <Alert>
        <AlertTitle>Tu solicitud está en revisión</AlertTitle>
        <AlertDescription>
          Alguien de la iglesia confirmará tu identidad y vinculará tu historial. Mientras tanto
          puedes seguir usando tu cuenta normalmente.
        </AlertDescription>
      </Alert>
    );
  }

  if (step === "revision") {
    return (
      <div className="space-y-4">
        {errorBox}
        <p className="text-muted-foreground text-[15px]">
          La iglesia revisará tu caso y, si corresponde, unirá tu historial con tu cuenta después de
          confirmar que eres tú. No se une nada sin esa confirmación.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="rv-note">¿Cómo estabas registrado? (opcional)</Label>
          <Textarea
            id="rv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Por ejemplo: visité en marzo, sirvo en Alabanza, usaba otro correo…"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => requestIdentityReviewAction({ phone, birthDate, note }), "revision_enviada")
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Enviar solicitud
          </Button>
          <Button type="button" variant="ghost" onClick={() => setStep("datos")}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  if (step === "codigo") {
    return (
      <div className="space-y-4">
        {errorBox}
        <Alert>
          <AlertTitle>Revisa tu correo</AlertTitle>
          <AlertDescription>
            Si encontramos un registro que concuerda con tus datos, enviamos un código de 6 dígitos
            al correo que la iglesia tenía en ese registro. Puede tardar unos minutos.
          </AlertDescription>
        </Alert>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="cl-code">Código</Label>
          <Input
            id="cl-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pending || code.length !== 6}
            onClick={() => run(() => verifyIdentityClaimAction(code), "listo")}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Verificar
          </Button>
          <Button type="button" variant="outline" onClick={() => setStep("revision")}>
            No recibí el código / ya no uso ese correo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {errorBox}
      <p className="text-muted-foreground text-[15px]">
        Usaremos tu nombre y el correo de tu cuenta. Si nos das tu teléfono o tu fecha de
        nacimiento, es más fácil encontrar tu registro. No te mostramos datos de nadie: si lo
        encontramos, el código va al correo que la iglesia ya tenía.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cl-phone">Teléfono (opcional)</Label>
          <Input
            id="cl-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cl-birth">Fecha de nacimiento (opcional)</Label>
          <Input
            id="cl-birth"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => run(() => startIdentityClaimAction({ phone, birthDate }), "codigo")}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Buscar mi registro
        </Button>
        <Button type="button" variant="ghost" onClick={() => setStep("revision")}>
          Prefiero que la iglesia lo revise
        </Button>
      </div>
    </div>
  );
}
