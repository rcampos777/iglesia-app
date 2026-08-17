"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { selfCheckinAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ConfirmCheckinButton({
  serviceId,
  alreadyCheckedIn,
}: {
  serviceId: string;
  alreadyCheckedIn: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(alreadyCheckedIn);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await selfCheckinAction(serviceId);
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  }

  if (done) {
    return (
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertDescription>¡Ya quedó registrada tu asistencia!</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button className="w-full" size="lg" onClick={handleClick} disabled={isPending}>
        {isPending ? "Confirmando..." : "Confirmar mi asistencia"}
      </Button>
    </div>
  );
}
