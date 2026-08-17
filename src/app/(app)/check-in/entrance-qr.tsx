"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function EntranceQr() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // window solo existe en el cliente; se lee tras montar para evitar
    // desajuste de hidratación (SSR no tiene location.origin real).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(`${window.location.origin}/check-in/publico`);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {url && (
        <div className="rounded-lg border bg-white p-4">
          <QRCodeSVG value={url} size={220} />
        </div>
      )}
      <p className="text-muted-foreground max-w-xs text-center text-sm">
        Imprime este código y ponlo en la entrada. No cambia — es el mismo QR siempre, solo abre y
        cierra el check-in del servicio abajo cuando corresponda.
      </p>
      {url && <p className="text-muted-foreground text-center text-xs break-all">{url}</p>}
    </div>
  );
}
