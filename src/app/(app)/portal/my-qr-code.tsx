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

  // El token vence a los 5 minutos: se renueva solo cada 4 mientras la
  // pantalla está abierta, para que el ujier nunca escanee uno vencido.
  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 4 * 60 * 1000);
    return () => window.clearInterval(id);
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
        Se renueva solo cada pocos minutos. Si el ujier te dice que expiró, toca «Regenerar código».
      </p>
      <Button variant="outline" size="sm" onClick={refresh} disabled={isPending}>
        <RefreshCw className="size-4" aria-hidden />
        {isPending ? "Generando..." : "Regenerar código"}
      </Button>
    </div>
  );
}
