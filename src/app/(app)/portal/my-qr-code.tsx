"use client";

import { useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw } from "lucide-react";
import { getMyCheckinTokenAction } from "../check-in/actions";
import { Button } from "@/components/ui/button";

export function MyQrCode() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const result = await getMyCheckinTokenAction();
      if (result.ok) {
        setToken(result.data.token);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!token && !error ? (
        <div className="bg-muted size-[194px] animate-pulse rounded-lg" aria-hidden />
      ) : null}
      {token && (
        <div className="rounded-lg border bg-white p-4">
          <QRCodeSVG value={token} size={160} />
        </div>
      )}
      <p className="text-muted-foreground max-w-xs text-center text-sm">
        Válido por unos minutos. Muéstralo al llegar al servicio y regenera si expiró.
      </p>
      <Button variant="outline" size="sm" onClick={refresh} disabled={isPending}>
        <RefreshCw className="size-4" aria-hidden />
        {isPending ? "Generando..." : "Regenerar código"}
      </Button>
    </div>
  );
}
