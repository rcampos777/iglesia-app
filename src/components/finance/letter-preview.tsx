import Image from "next/image";
import type { LetterSnapshot } from "@/lib/finance/letter";

/** Vista previa en pantalla: mismo contenido que el PDF (misma instantánea). */
export function LetterPreview({ s }: { s: LetterSnapshot }) {
  const contact = [s.church.address, s.church.phone, s.church.email].filter(Boolean).join(" · ");
  return (
    <article
      aria-label="Vista previa de la carta"
      className="mx-auto max-w-2xl rounded-lg border bg-white p-6 text-[15px] leading-relaxed text-neutral-900 shadow-sm sm:p-10"
    >
      {s.draft ? (
        <p className="mb-6 rounded bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
          BORRADOR — Plantilla provisional pendiente de revisión. No usar como documento oficial.
        </p>
      ) : null}
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <Image
          src="/brand/logo-full.png"
          alt="Ciudad de Avivamiento"
          width={170}
          height={170}
          className="h-auto w-40"
        />
        <div className="sm:text-right">
          <p className="font-semibold">{s.church.name}</p>
          {contact ? <p className="text-xs text-neutral-500">{contact}</p> : null}
          {s.church.tax_id ? (
            <p className="text-xs text-neutral-500">Núm. de identificación: {s.church.tax_id}</p>
          ) : null}
        </div>
      </header>
      <p className="mt-5 text-sm text-neutral-500">Fecha de emisión: {s.issue_date_text}</p>
      <p className="mt-4 font-semibold">{s.recipient}</p>
      <h3 className="mt-5 text-xl font-semibold">Certificación de aportaciones</h3>
      <p className="mt-3 whitespace-pre-wrap">{s.body}</p>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded border p-4 text-sm">
        <dt className="text-neutral-500">Donante</dt>
        <dd>{s.person_name}</dd>
        <dt className="text-neutral-500">Período certificado</dt>
        <dd>{s.period_text}</dd>
        <dt className="text-neutral-500">Total registrado</dt>
        <dd className="font-semibold">{s.total_text}</dd>
        <dt className="text-neutral-500">Aportaciones incluidas</dt>
        <dd>{s.donation_count}</dd>
      </dl>
      <p className="mt-6">{s.closing}</p>
      <div className="mt-12 w-56 border-t border-neutral-800 pt-1 text-sm">
        <p className={s.signer_name ? "font-semibold" : "text-neutral-500"}>
          {s.signer_name ?? "Nombre del firmante (pendiente)"}
        </p>
        <p className="text-neutral-500">{s.signer_title ?? "Cargo (pendiente)"}</p>
      </div>
      <p className="mt-8 border-t pt-2 text-xs text-neutral-500">
        Documento {s.document_code} · Versión {s.version} · El PDF incluye además el detalle de las
        aportaciones.
      </p>
    </article>
  );
}
