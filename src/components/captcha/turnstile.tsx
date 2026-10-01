"use client";

import { useEffect, useRef } from "react";

/**
 * CAPTCHA de Cloudflare Turnstile (docs/security.md §8.n). Se dibuja dentro
 * de un <form> y agrega ahí un campo oculto `captchaToken` que viaja con el
 * envío. Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY no se muestra (desarrollo sin
 * configurar). `resetKey`: cámbialo después de cada envío; el token sirve
 * una sola vez.
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile"));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar la verificación."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({ resetKey }: { resetKey?: unknown }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        widgetId.current = api.render(box.current, {
          sitekey: siteKey,
          language: "es",
          theme: "light",
          "response-field-name": "captchaToken",
        });
      })
      .catch(() => undefined); // El servidor rechaza el envío sin token y lo explica.
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
