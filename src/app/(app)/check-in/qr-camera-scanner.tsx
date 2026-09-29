"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Escáner de QR con la cámara del celular/tablet. El permiso de cámara se
 * pide solo al tocar "Activar cámara". Usa BarcodeDetector si el
 * navegador lo trae (Chrome/Android) y, si no (Safari/iPhone), jsQR
 * cargado bajo demanda.
 */
export function QrCameraScanner({
  onDetected,
  paused,
}: {
  onDetected: (value: string) => void;
  paused: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);
  const pausedRef = useRef(paused);
  const onDetectedRef = useRef(onDetected);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
    onDetectedRef.current = onDetected;
  }, [paused, onDetected]);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite usar la cámara. Usa la búsqueda por nombre.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch {
      setError(
        "No se pudo usar la cámara. Revisa el permiso de cámara del navegador o usa la búsqueda por nombre.",
      );
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    setActive(true);

    let detector: Detector | null = null;
    let jsQR: typeof import("jsqr").default | null = null;
    const BD = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
      .BarcodeDetector;
    if (BD) {
      try {
        detector = new BD({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }
    if (!detector) jsQR = (await import("jsqr")).default;

    const tick = async () => {
      if (!streamRef.current) return;
      const canvas = canvasRef.current;
      if (!pausedRef.current && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        let value: string | null = null;
        try {
          if (detector) {
            const codes = await detector.detect(video);
            value = codes[0]?.rawValue ?? null;
          } else if (jsQR) {
            const w = Math.min(video.videoWidth, 640);
            const h = Math.round((video.videoHeight / video.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              value = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          }
        } catch {
          value = null;
        }
        // El mismo código no se reenvía durante 4 s.
        const last = lastRef.current;
        if (value && !(last && last.value === value && Date.now() - last.at < 4000)) {
          lastRef.current = { value, at: Date.now() };
          onDetectedRef.current(value);
        }
      }
      timerRef.current = window.setTimeout(tick, 250);
    };
    void tick();
  }

  return (
    <div className="space-y-3">
      <div
        className={
          active
            ? "relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black"
            : "hidden"
        }
      >
        <video ref={videoRef} muted playsInline className="size-full object-cover" />
        <div
          className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80"
          aria-hidden
        />
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {active ? (
        <Button type="button" variant="outline" className="h-11! w-full" onClick={stop}>
          <CameraOff className="size-4" aria-hidden />
          Apagar cámara
        </Button>
      ) : (
        <Button type="button" className="h-12! w-full text-base" onClick={start}>
          <Camera className="size-5" aria-hidden />
          Activar cámara
        </Button>
      )}
    </div>
  );
}
