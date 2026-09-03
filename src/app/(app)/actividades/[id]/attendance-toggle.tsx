"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { removeParticipantAction, setAttendanceAction } from "../actions";
import type { ActivityParticipantWithPerson } from "@/lib/data/activities";

export function ParticipantRow({
  activityId,
  participant,
  canManage,
}: {
  activityId: string;
  participant: ActivityParticipantWithPerson;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [attended, setAttended] = useState(participant.attended);
  const [error, setError] = useState<string | null>(null);

  const fullName = `${participant.personFirstName} ${participant.personLastName}`;

  function toggle(next: boolean) {
    setAttended(next);
    startTransition(async () => {
      const result = await setAttendanceAction(activityId, participant.id, next);
      if (!result.ok) {
        setAttended(!next); // revertir el optimismo si el servidor rechaza
        setError(result.error);
      } else {
        setError(null);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeParticipantAction(activityId, participant.id);
      setError(result.ok ? null : result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{fullName}</p>
        <p className="text-muted-foreground truncate text-sm">
          {participant.personPhone || participant.personEmail || "sin contacto"}
          {participant.notes ? ` · ${participant.notes}` : ""}
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`asistio-${participant.id}`}
            checked={attended}
            disabled={!canManage || isPending}
            onCheckedChange={(v) => toggle(v === true)}
          />
          <label htmlFor={`asistio-${participant.id}`} className="text-sm">
            Asistió
          </label>
        </div>
        {canManage && (
          <Button variant="ghost" size="sm" onClick={remove} disabled={isPending}>
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}
