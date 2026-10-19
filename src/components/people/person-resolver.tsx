"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MatchList, type MatchItem } from "./match-list";
import type { ActionResult } from "@/lib/action-result";
import type { QuickPersonInput } from "@/lib/validations/person-registry";

export type ResolverSubmitResult = { status: "matches"; matches: MatchItem[] } | { status: "done" };

const empty: QuickPersonInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  birthDate: "",
};

function newKey() {
  return crypto.randomUUID();
}

/**
 * Registrar a alguien sin duplicarlo: primero se buscan coincidencias; se
 * elige una existente o, si ninguna corresponde, se crea con las vistas
 * marcadas como revisadas. La clave del envío evita duplicados por doble
 * clic. Solo el nombre es obligatorio.
 */
export function PersonResolver({
  submitNew,
  chooseExisting,
  existingLabel = "Es esta persona",
  createLabel = "Registrar",
  showBirthDate = true,
  emailHelp,
  disableExisting,
}: {
  submitNew: (
    input: QuickPersonInput,
    acknowledged: string[],
    requestKey: string,
  ) => Promise<ActionResult<ResolverSubmitResult>>;
  chooseExisting: (match: MatchItem) => Promise<ActionResult<unknown>>;
  existingLabel?: string;
  createLabel?: string;
  showBirthDate?: boolean;
  emailHelp?: string;
  disableExisting?: (match: MatchItem) => string | null;
}) {
  const [form, setForm] = useState<QuickPersonInput>(empty);
  const [requestKey, setRequestKey] = useState(newKey);
  const [matches, setMatches] = useState<MatchItem[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function set<K extends keyof QuickPersonInput>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    // Cambiar los datos invalida las coincidencias revisadas.
    setMatches(null);
  }

  function reset() {
    setForm(empty);
    setMatches(null);
    setRequestKey(newKey());
    setFieldErrors({});
  }

  async function run(acknowledged: string[]) {
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await submitNew(form, acknowledged, requestKey);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      } else if (res.data.status === "matches") {
        setMatches(res.data.matches);
      } else {
        reset();
      }
    } catch {
      setError("No se pudo guardar. Revisa la conexión e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  async function pick(m: MatchItem) {
    setPending(true);
    setError(null);
    try {
      const res = await chooseExisting(m);
      if (!res.ok) setError(res.error);
      else reset();
    } catch {
      setError("No se pudo guardar. Revisa la conexión e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  const err = (k: string) =>
    fieldErrors[k]?.[0] ? (
      <p className="text-destructive text-sm" role="alert">
        {fieldErrors[k][0]}
      </p>
    ) : null;

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pr-first">Nombre *</Label>
          <Input
            id="pr-first"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            maxLength={100}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.firstName)}
          />
          {err("firstName")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-last">Apellidos</Label>
          <Input
            id="pr-last"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-email">Correo</Label>
          <Input
            id="pr-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            maxLength={254}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {emailHelp ? <p className="text-muted-foreground text-xs">{emailHelp}</p> : null}
          {err("email")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-phone">Teléfono</Label>
          <Input
            id="pr-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            maxLength={30}
            autoComplete="off"
          />
        </div>
        {showBirthDate ? (
          <div className="space-y-1.5">
            <Label htmlFor="pr-birth">Fecha de nacimiento</Label>
            <Input
              id="pr-birth"
              type="date"
              value={form.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
              aria-invalid={Boolean(fieldErrors.birthDate)}
            />
            {err("birthDate")}
          </div>
        ) : null}
      </div>

      {matches ? (
        <div className="space-y-3" aria-live="polite">
          <Alert>
            <AlertTitle>Parece que esta persona ya tiene un registro</AlertTitle>
            <AlertDescription>
              Revisa si alguna de estas personas es la misma. Si ninguna corresponde, regístrala
              como persona nueva.
            </AlertDescription>
          </Alert>
          <MatchList
            items={matches}
            action={(m) => {
              const blocked = disableExisting?.(m) ?? null;
              return blocked ? (
                <span className="text-muted-foreground text-sm">{blocked}</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => pick(m)}
                >
                  {existingLabel}
                </Button>
              );
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(matches.map((m) => m.id))}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Ninguna es esta persona: registrar nueva
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setMatches(null)}
            >
              Corregir datos
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={pending || !form.firstName.trim()} onClick={() => run([])}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="size-4" aria-hidden />
          )}
          {createLabel}
        </Button>
      )}
    </div>
  );
}
