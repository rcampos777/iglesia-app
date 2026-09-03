"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { endMinistryMembershipAction, updateMemberRoleAction } from "../actions";
import { ministryMemberRoleLabels } from "@/lib/labels";
import { ministryMemberRoleValues } from "@/lib/validations/ministries";
import type { MinistryMemberWithPerson } from "@/lib/data/ministries";
import type { MinistryMemberRole } from "@/types/database";

export function MemberRow({
  ministryId,
  member,
  canManage,
  canOpenPerson,
}: {
  ministryId: string;
  member: MinistryMemberWithPerson;
  canManage: boolean;
  /** Solo staff puede abrir la ficha completa de la persona. */
  canOpenPerson: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fullName = `${member.personFirstName} ${member.personLastName}`;

  function changeRole(role: MinistryMemberRole) {
    startTransition(async () => {
      const result = await updateMemberRoleAction(ministryId, member.id, role);
      setError(result.ok ? null : result.error);
    });
  }

  function endMembership() {
    startTransition(async () => {
      const result = await endMinistryMembershipAction(ministryId, member.id);
      setError(result.ok ? null : result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {canOpenPerson ? (
          <Link href={`/personas/${member.person_id}`} className="font-medium hover:underline">
            {fullName}
          </Link>
        ) : (
          <p className="font-medium">{fullName}</p>
        )}
        <p className="text-muted-foreground truncate text-sm">
          {member.personPhone || member.personEmail || "sin contacto"} · desde {member.joined_at}
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-2">
          <Select
            defaultValue={member.role_in_ministry}
            onValueChange={(v) => changeRole(v as MinistryMemberRole)}
            disabled={isPending}
          >
            <SelectTrigger className="w-44" aria-label={`Responsabilidad de ${fullName}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ministryMemberRoleValues.map((r) => (
                <SelectItem key={r} value={r}>
                  {ministryMemberRoleLabels[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                Dar de baja
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Dar de baja a {fullName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Deja de servir en este ministerio desde hoy. No se borra nada: queda en el
                  histórico y puede volver a agregarse después.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={endMembership}>Dar de baja</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <span className="text-muted-foreground shrink-0 text-sm">
          {ministryMemberRoleLabels[member.role_in_ministry]}
        </span>
      )}
    </div>
  );
}
