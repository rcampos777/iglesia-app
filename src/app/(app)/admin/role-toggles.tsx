"use client";

import { useTransition } from "react";
import { grantRoleAction, revokeRoleAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { roleLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";

const ALL_ROLES: AppRole[] = [
  "miembro",
  "maestro",
  "seguimiento",
  "intercesor",
  "coordinador_ministerio",
  "pastor",
  "administrador",
];

export function RoleToggles({ userId, roles }: { userId: string; roles: string[] }) {
  const [isPending, startTransition] = useTransition();
  const activeRoles = new Set(roles);

  function toggle(role: AppRole) {
    startTransition(async () => {
      if (activeRoles.has(role)) {
        await revokeRoleAction(userId, role);
      } else {
        await grantRoleAction(userId, role);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_ROLES.map((role) => {
        const active = activeRoles.has(role);
        return (
          <button
            key={role}
            type="button"
            disabled={isPending}
            onClick={() => toggle(role)}
            className="disabled:opacity-50"
          >
            <Badge
              variant={active ? "default" : "outline"}
              className={cn("cursor-pointer select-none", !active && "text-muted-foreground")}
            >
              {roleLabels[role]}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
