"use client";

import { useTransition } from "react";
import { updateFollowUpStatusAction } from "../actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { followupStatusLabels } from "@/lib/labels";
import { followupStatusValues } from "@/lib/validations/visitors";
import type { FollowupStatus } from "@/types/database";

export function StatusSelector({
  followUpId,
  currentStatus,
}: {
  followUpId: string;
  currentStatus: FollowupStatus;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={currentStatus}
      disabled={isPending}
      onValueChange={(value) => {
        startTransition(async () => {
          await updateFollowUpStatusAction(followUpId, value as FollowupStatus);
        });
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {followupStatusValues.map((s) => (
          <SelectItem key={s} value={s}>
            {followupStatusLabels[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
