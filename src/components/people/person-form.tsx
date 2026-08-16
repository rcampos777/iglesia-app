"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult<CreatePersonResult | undefined>, formData: FormData) => {
      if (confirmDuplicate) formData.set("confirmDuplicate", "true");
      const result = await action(formData);
      if (result.ok && result.data && !("duplicates" in result.data)) {
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  const duplicates = state.ok ? state.data?.duplicates : undefined;
  const fieldErrors = !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {duplicates && duplicates.length > 0 && (
        <Alert>
          <AlertTitle>Posibles duplicados encontrados</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.firstName} {d.lastName} — {d.email || d.phone}
                </li>
              ))}
            </ul>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <Checkbox
                checked={confirmDuplicate}
                onCheckedChange={(v) => setConfirmDuplicate(v === true)}
              />
              Confirmo que es una persona distinta, crear de todas formas.
            </label>
          </AlertDescription>
        </Alert>
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
        <div className="space-y-2">
          <Label htmlFor="addressLine">Dirección</Label>
          <Input id="addressLine" name="addressLine" defaultValue={person?.address_line ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Ciudad</Label>
          <Input id="city" name="city" defaultValue={person?.city ?? ""} />
        </div>
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
