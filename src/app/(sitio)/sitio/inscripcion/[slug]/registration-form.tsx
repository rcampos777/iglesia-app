"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { formatCents } from "@/lib/money";
import { submitRegistrationAction, type RegistrationDone } from "./actions";

type State = ActionResult<RegistrationDone> | null;

const inputCls =
  "block w-full rounded-2xl border border-[#d8cfbd] bg-white px-4 py-3 text-[17px] text-[#1D191A] outline-none placeholder:text-[#aaa] focus-visible:border-[#1D191A] focus-visible:ring-2 focus-visible:ring-[#1D191A]/20 aria-[invalid=true]:border-[#b42318]";

export function RegistrationForm({
  slug,
  priceCents,
  depositCents,
  paymentInstructions,
}: {
  slug: string;
  priceCents: number | null;
  depositCents: number | null;
  paymentInstructions: string | null;
}) {
  const [state, dispatch, pending] = useActionState(
    (_prev: State, fd: FormData) => submitRegistrationAction(slug, fd),
    null,
  );
  const [attends, setAttends] = useState<string>("");
  const [medical, setMedical] = useState<string>("");
  const mountedAt = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (state && !state.ok) errorRef.current?.focus();
  }, [state]);

  if (state?.ok) {
    return (
      <div className="space-y-5" role="status">
        <CheckCircle2 className="size-12 text-[#3f7d4e]" aria-hidden />
        <h2 className="text-[32px] leading-[36px] font-light tracking-[-1px]">
          ¡Listo, {state.data.firstName}!
        </h2>
        <p className="text-[18px] leading-[27px] text-[#444]">
          Recibimos tu inscripción. Te enviamos un correo a <b>{state.data.email}</b> con todos los
          detalles (revisa también la carpeta de spam).
        </p>
        {depositCents ? (
          <p className="text-[18px] leading-[27px] text-[#444]">
            Tu espacio queda reservado cuando recibamos el depósito de{" "}
            <b>{formatCents(depositCents)}</b>
            {priceCents ? <> (costo total {formatCents(priceCents)})</> : null}.
          </p>
        ) : null}
        {paymentInstructions ? (
          <div className="rounded-2xl bg-[#F5F0E8] p-4 text-[17px] leading-[26px]">
            <p className="mb-1 font-medium">Cómo pagar</p>
            <p className="whitespace-pre-line">{paymentInstructions}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const err = (name: string) => (state && !state.ok ? state.fieldErrors?.[name]?.[0] : undefined);
  const invalid = (name: string) => (err(name) ? true : undefined);
  const describedBy = (name: string) => (err(name) ? `${name}-error` : undefined);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        // Se envía a mano (no con `action=`) para que React no borre lo
        // escrito si hay que corregir algo.
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // Tiempo de llenado medido aquí mismo: no depende del reloj del
        // teléfono, que puede estar desajustado respecto al servidor.
        fd.set("elapsed", String(Math.round(performance.now() - mountedAt.current)));
        startTransition(() => dispatch(fd));
      }}
      className="space-y-6"
    >
      <p className="text-[15px] text-[#666]">
        Los campos con <span className="text-[#b42318]">*</span> son obligatorios.
      </p>

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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="firstName" label="Nombre" error={err("firstName")}>
          <input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            maxLength={80}
            className={inputCls}
            aria-invalid={invalid("firstName")}
            aria-describedby={describedBy("firstName")}
          />
        </Field>
        <Field name="lastName" label="Apellidos" error={err("lastName")}>
          <input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            required
            maxLength={80}
            className={inputCls}
            aria-invalid={invalid("lastName")}
            aria-describedby={describedBy("lastName")}
          />
        </Field>
      </div>

      <Field name="address" label="Dirección física" error={err("address")}>
        <textarea
          id="address"
          name="address"
          autoComplete="street-address"
          required
          rows={2}
          maxLength={300}
          className={inputCls}
          aria-invalid={invalid("address")}
          aria-describedby={describedBy("address")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-[120px_1fr]">
        <Field name="age" label="Edad" error={err("age")}>
          <input
            id="age"
            name="age"
            inputMode="numeric"
            required
            maxLength={3}
            className={inputCls}
            aria-invalid={invalid("age")}
            aria-describedby={describedBy("age")}
          />
        </Field>
        <Field name="phone" label="Número telefónico" error={err("phone")}>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            maxLength={30}
            placeholder="787-000-0000"
            className={inputCls}
            aria-invalid={invalid("phone")}
            aria-describedby={describedBy("phone")}
          />
        </Field>
      </div>

      <Field name="email" label="Correo electrónico" error={err("email")}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className={inputCls}
          aria-invalid={invalid("email")}
          aria-describedby={describedBy("email")}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="emergencyName"
          label="Familiar en caso de emergencia"
          error={err("emergencyName")}
        >
          <input
            id="emergencyName"
            name="emergencyName"
            required
            maxLength={150}
            className={inputCls}
            aria-invalid={invalid("emergencyName")}
            aria-describedby={describedBy("emergencyName")}
          />
        </Field>
        <Field name="emergencyPhone" label="Teléfono del familiar" error={err("emergencyPhone")}>
          <input
            id="emergencyPhone"
            name="emergencyPhone"
            type="tel"
            required
            maxLength={30}
            className={inputCls}
            aria-invalid={invalid("emergencyPhone")}
            aria-describedby={describedBy("emergencyPhone")}
          />
        </Field>
      </div>

      <YesNo
        name="attendsChurch"
        legend="¿Perseveras en alguna iglesia?"
        error={err("attendsChurch")}
        onChange={setAttends}
      />
      {attends === "si" ? (
        <Field name="churchName" label="Nombre de la iglesia" error={err("churchName")}>
          <input
            id="churchName"
            name="churchName"
            required
            maxLength={150}
            className={inputCls}
            aria-invalid={invalid("churchName")}
            aria-describedby={describedBy("churchName")}
          />
        </Field>
      ) : null}

      <YesNo
        name="hasMedicalCondition"
        legend="¿Padeces de alguna condición médica?"
        error={err("hasMedicalCondition")}
        onChange={setMedical}
      />
      {medical === "si" ? (
        <Field
          name="medicalDetails"
          label="¿Cuál? (opcional, solo la verán los organizadores)"
          required={false}
          error={err("medicalDetails")}
        >
          <textarea
            id="medicalDetails"
            name="medicalDetails"
            rows={2}
            maxLength={500}
            className={inputCls}
          />
        </Field>
      ) : null}

      <div>
        <label className="flex items-start gap-3 text-[17px] leading-[25px]">
          <input
            type="checkbox"
            name="acceptTerms"
            value="si"
            required
            className="mt-1 size-5 shrink-0 accent-[#1D191A]"
            aria-invalid={invalid("acceptTerms")}
            aria-describedby={describedBy("acceptTerms")}
          />
          <span>
            {depositCents ? (
              <>
                Acepto que el depósito de {formatCents(depositCents)} para reservar{" "}
                <b>no es reembolsable</b>
                {priceCents ? <> y que el costo total es de {formatCents(priceCents)}</> : null}.
              </>
            ) : priceCents ? (
              <>Acepto que el costo total es de {formatCents(priceCents)}.</>
            ) : (
              <>Confirmo que los datos son correctos.</>
            )}{" "}
            <span className="text-[#b42318]">*</span>
          </span>
        </label>
        {err("acceptTerms") ? (
          <p id="acceptTerms-error" className="mt-1 text-[15px] text-[#b42318]">
            {err("acceptTerms")}
          </p>
        ) : null}
      </div>

      {/* Aviso en el punto de recogida (auditoría 2026-10-01, H-08). Solo
          describe lo que el sistema hace hoy; no promete plazos. */}
      <p className="text-[15px] leading-[22px] text-[#1D191A]/75">
        <b>Sobre tus datos:</b> los recibe la iglesia para organizar esta actividad y comunicarse
        contigo. Si todavía no estás en su directorio, se crea tu registro como visitante. La
        información médica y el contacto de emergencia solo los ven quienes organizan o administran
        las actividades de la iglesia, y no se incluyen en los emails. Recibirás por email la
        confirmación y recordatorios de esta actividad. Para consultar, corregir o pedir que se
        borren tus datos, escribe a la iglesia.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="flex h-[56px] w-full items-center justify-center rounded-full bg-[#1D191A] px-6 text-[18px] font-medium text-[#F1E5C6] transition-opacity focus-visible:ring-2 focus-visible:ring-[#1D191A] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Inscribirme"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  error,
  required = true,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="block text-[16px] font-medium">
        {label} {required ? <span className="text-[#b42318]">*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-[15px] text-[#b42318]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function YesNo({
  name,
  legend,
  error,
  onChange,
}: {
  name: string;
  legend: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-[16px] font-medium">
        {legend} <span className="text-[#b42318]">*</span>
      </legend>
      <div className="flex gap-3">
        {[
          ["si", "Sí"],
          ["no", "No"],
        ].map(([value, text]) => (
          <label
            key={value}
            className="flex h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#d8cfbd] text-[17px] has-[:checked]:border-[#1D191A] has-[:checked]:bg-[#1D191A] has-[:checked]:text-[#F1E5C6] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#1D191A]/30"
          >
            <input
              type="radio"
              name={name}
              value={value}
              required
              className="sr-only"
              onChange={(e) => onChange(e.target.value)}
            />
            {text}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-[15px] text-[#b42318]">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
