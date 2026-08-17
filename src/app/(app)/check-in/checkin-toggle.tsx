"use client";

import { useTransition } from "react";
import { toggleCheckinOpenAction } from "./actions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function CheckinToggle({ serviceId, isOpen }: { serviceId: string; isOpen: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Label htmlFor={`open-${serviceId}`} className="text-muted-foreground text-xs">
        {isOpen ? "Abierto" : "Cerrado"}
      </Label>
      <Switch
        id={`open-${serviceId}`}
        checked={isOpen}
        disabled={isPending}
        onCheckedChange={(checked) => {
          startTransition(async () => {
            await toggleCheckinOpenAction(serviceId, checked);
          });
        }}
      />
    </div>
  );
}
