"use client";

import { useTransition } from "react";
import { assignToMeAction, updatePrayerStatusAction } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PrayerStatus } from "@/types/database";

const statusLabels: Record<PrayerStatus, string> = {
  nueva: "Nueva",
  en_oracion: "En oración",
  respondida: "Respondida",
  cerrada: "Cerrada",
};

export function StatusControls({
  requestId,
  currentStatus,
  assignedToMe,
}: {
  requestId: string;
  currentStatus: PrayerStatus;
  assignedToMe: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        defaultValue={currentStatus}
        disabled={isPending}
        onValueChange={(value) => {
          startTransition(async () => {
            await updatePrayerStatusAction(requestId, value as PrayerStatus);
          });
        }}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(statusLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!assignedToMe && (
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await assignToMeAction(requestId);
            })
          }
        >
          Asignarme
        </Button>
      )}
      {assignedToMe && <span className="text-muted-foreground text-sm">Asignada a ti</span>}
    </div>
  );
}
