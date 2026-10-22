"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Turnstile } from "@/components/captcha/turnstile";
import type { ActionResult } from "@/lib/action-result";
import { submitContactAction } from "@/app/(sitio)/sitio/contact-actions";

const inputCls =
  "w-full rounded-2xl border border-[#1D191A]/15 bg-white px-4 py-3 text-[17px] text-[#1D191A] outline-none placeholder:text-[#999] focus:border-[#1D191A] focus:ring-2 focus:ring-[#1D191A]/15 aria-[invalid=true]:border-[#b42318]";

export function ContactForm() {
  const mountedAt = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ActionResult | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (state && !state.ok) errorRef.current?.focus();
  }, [state]);

  if (sent) {
    return (
      <div role="status" className="rounded-[24px] bg-white p-6 text-[17px] leading-[26px]">
        <CheckCircle2 className="mb-3 size-8 text-[#3f7d4e]" aria-hidden />
        <p className="text-[21px] font-medium">¡Gracias por escribirnos!</p>
        <p className="mt-1 text-[#666]">Recibimos tu mensaje y te responderemos pronto.</p>
      </div>
    );
  }

  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined);
  const field = (name: string) => ({
    id: `contact-${name}`,
    name,
    "aria-invalid": err(name) ? true : undefined,
    "aria-describedby": err(name) ? `contact-${name}-error` : undefined,
  });
  const errorText = (name: string) =>
    err(name) ? (
      <p id={`contact-${name}-error`} className="mt-1.5 text-[15px] text-[#b42318]">
        {err(name)}
      </p>
    ) : null;
  const label = "mb-1.5 block text-[15px] font-medium";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("elapsed", String(Math.round(performance.now() - mountedAt.current)));
        startTransition(async () => {
          try {
            const res = await submitContactAction(fd);
            setState(res);
            if (res.ok) setSent(true);
          } catch {
            setState({ ok: false, error: "No hubo respuesta del servidor. Intenta de nuevo." });
          }
        });
      }}
      className="space-y-5"
    >
      {state && !state.ok ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-2xl border border-[#f1b8b0] bg-[#fdf1ef] p-4 text-[16px] text-[#8a1c10] outline-none"
        >
          {state.error}
        </div>
      ) : null}

      {/* Anti-spam: invisible para personas. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No llenar
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div>
        <label htmlFor="contact-name" className={label}>
          Nombre
        </label>
        <input {...field("name")} autoComplete="name" maxLength={120} className={inputCls} />
        {errorText("name")}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-email" className={label}>
            Correo electrónico
          </label>
          <input
            {...field("email")}
            type="email"
            autoComplete="email"
            maxLength={200}
            className={inputCls}
          />
          {errorText("email")}
        </div>
        <div>
          <label htmlFor="contact-phone" className={label}>
            Teléfono <span className="font-normal text-[#888]">(opcional)</span>
          </label>
          <input
            {...field("phone")}
            type="tel"
            autoComplete="tel"
            maxLength={30}
            className={inputCls}
          />
          {errorText("phone")}
        </div>
      </div>
      <div>
        <label htmlFor="contact-message" className={label}>
          Mensaje
        </label>
        <textarea {...field("message")} rows={5} maxLength={4000} className={inputCls} />
        {errorText("message")}
      </div>

      <p className="text-[14px] leading-[21px] text-[#1D191A]/70">
        Tu mensaje lo leen la administración y el equipo de seguimiento de la iglesia, solo para
        responderte. Si es una petición de oración, envíala desde el portal de miembros.{" "}
        <a href="/sitio/privacidad" target="_blank" className="underline underline-offset-4">
          Aviso de privacidad
        </a>
        .
      </p>

      <Turnstile resetKey={state} />

      <button
        type="submit"
        disabled={pending}
        className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#1D191A] px-6 text-[18px] font-medium text-[#F1E5C6] transition-opacity focus-visible:ring-2 focus-visible:ring-[#1D191A] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 sm:w-auto sm:px-10"
      >
        {pending ? "Enviando..." : "Enviar mensaje"}
      </button>
    </form>
  );
}
