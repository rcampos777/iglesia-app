"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressFields } from "./address-fields";
import { MatchList, toMatchItem } from "./match-list";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { membershipStatusLabels, genderLabels } from "@/lib/labels";
import { membershipStatusValues, genderValues } from "@/lib/validations/people";
import type { ActionResult } from "@/lib/action-result";
import type { PersonRow } from "@/types/database";
import type { CreatePersonResult } from "@/app/(app)/personas/actions";

type PersonFormAction = (
  formData: FormData,
) => Promise<ActionResult<CreatePersonResult | undefined>>;

const initialState: ActionResult<CreatePersonResult | undefined> = { ok: true, data: undefined };

export function PersonForm({
  action,
  person,
  submitLabel = "Guardar",
}: {
  action: PersonFormAction;
  person?: PersonRow;
  submitLabel?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Una clave por formulario: un doble envío no crea dos personas.
  const [requestKey] = useState(() => crypto.randomUUID());

  const [state, dispatch, isPending] = useActionState(
    async (_prev: ActionResult<CreatePersonResult | undefined>, formData: FormData) => {
      const result = await action(formData);
      if (result.ok && result.data && !("matches" in result.data)) {
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  // Se envía con onSubmit (no con `action` del form) para que React no
  // vacíe los campos mientras se revisan las coincidencias.
  function send(acknowledged: string[]) {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("requestKey", requestKey);
    fd.set("acknowledged", acknowledged.join(","));
    startTransition(() => dispatch(fd));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send([]);
  }

  const matches = state.ok ? state.data?.matches : undefined;
  const fieldErrors = !state.ok ? state.fieldErrors : undefined;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6" noValidate>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {matches && matches.length > 0 && (
        <div className="space-y-3" aria-live="polite">
          <Alert>
            <AlertTitle>Parece que esta persona ya tiene un registro</AlertTitle>
            <AlertDescription>
              Ábrela para revisarla en vez de crear otra. Si ninguna es la misma persona, regístrala
              como nueva.
            </AlertDescription>
          </Alert>
          <MatchList
            items={matches.map(toMatchItem)}
            action={(m) => (
              <Button asChild size="sm" variant="outline">
                <Link href={`/personas/${m.id}`}>Abrir ficha</Link>
              </Button>
            )}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => send(matches.map((m) => m.person_id))}
          >
            Ninguna es esta persona: registrar nueva
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nombre *</Label>
          <Input id="firstName" name="firstName" defaultValue={person?.first_name} required />
          {fieldErrors?.firstName && (
            <p className="text-destructive text-sm">{fieldErrors.firstName[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Apellido *</Label>
          <Input id="lastName" name="lastName" defaultValue={person?.last_name} required />
          {fieldErrors?.lastName && (
            <p className="text-destructive text-sm">{fieldErrors.lastName[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferredName">Nombre preferido</Label>
          <Input
            id="preferredName"
            name="preferredName"
            defaultValue={person?.preferred_name ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthDate">Fecha de nacimiento</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={person?.birth_date ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gender">Género</Label>
          <Select name="gender" defaultValue={person?.gender ?? undefined}>
            <SelectTrigger id="gender" className="w-full">
              <SelectValue placeholder="Selecciona" />
            </SelectTrigger>
            <SelectContent>
              {genderValues.map((g) => (
                <SelectItem key={g} value={g}>
                  {genderLabels[g]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="membershipStatus">Estatus *</Label>
          <Select
            name="membershipStatus"
            defaultValue={person?.membership_status ?? "visitante"}
            required
          >
            <SelectTrigger id="membershipStatus" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {membershipStatusValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {membershipStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={person?.email ?? ""} />
          {fieldErrors?.email && <p className="text-destructive text-sm">{fieldErrors.email[0]}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" name="phone" defaultValue={person?.phone ?? ""} />
        </div>
        <AddressFields person={person} />
        <div className="space-y-2">
          <Label htmlFor="maritalStatus">Estado civil</Label>
          <Input
            id="maritalStatus"
            name="maritalStatus"
            defaultValue={person?.marital_status ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="joinedAt">Fecha de ingreso</Label>
          <Input id="joinedAt" name="joinedAt" type="date" defaultValue={person?.joined_at ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={4} defaultValue={person?.notes ?? ""} />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : submitLabel}
      </Button>
    </form>
  );
}
