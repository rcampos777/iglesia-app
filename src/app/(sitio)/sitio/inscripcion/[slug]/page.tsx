import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, DollarSign, MapPin } from "lucide-react";
import { SitePage } from "@/components/sitio/site-page";
import { publicRegistrationActivity } from "@/lib/data/registrations";
import { siteMediaUrl } from "@/lib/site/media";
import { safe } from "@/lib/site/load";
import { formatDateKeyInline, formatLocalTime } from "@/lib/datetime";
import { formatCents } from "@/lib/money";
import { RegistrationForm } from "./registration-form";

// Corto: el cupo y el cierre cambian. La función de envío vuelve a
// comprobar todo, así que un dato viejo nunca deja pasar a nadie.
export const revalidate = 60;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function load(slug: string) {
  return SLUG_RE.test(slug) && slug.length <= 80
    ? safe("inscripción", publicRegistrationActivity(slug), null)
    : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const a = await load((await params).slug);
  return a ? { title: `Inscripción: ${a.name}`, description: a.description?.slice(0, 160) } : {};
}

function dateText(start: string, end: string | null): string {
  const s = formatDateKeyInline(start, !end || end === start);
  const text = !end || end === start ? s : `${s} al ${formatDateKeyInline(end)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function RegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await load(slug);
  if (!a) notFound();

  return (
    <SitePage eyebrow="Inscripción" title={a.name} lead={a.description ?? undefined}>
      <div className="bg-[#F5F0E8] text-[#1D191A]">
        <div className="mx-auto grid max-w-6xl gap-10 px-[19px] py-12 md:grid-cols-[1fr_1.1fr] md:px-8 md:py-16">
          <div className="space-y-6">
            {a.flyer_path ? (
              <Image
                src={siteMediaUrl(a.flyer_path)}
                alt={a.flyer_alt || `Promoción de ${a.name}`}
                width={1200}
                height={800}
                unoptimized
                priority
                className="h-auto w-full rounded-[28px]"
              />
            ) : null}
            <ul className="space-y-4 text-[18px]">
              <li className="flex gap-3">
                <CalendarDays className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                <span>{dateText(a.activity_date, a.end_date)}</span>
              </li>
              {a.start_time ? (
                <li className="flex gap-3">
                  <Clock className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                  <span>Llegada: {formatLocalTime(a.start_time)}</span>
                </li>
              ) : null}
              {a.location ? (
                <li className="flex gap-3">
                  <MapPin className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                  <span>{a.location}</span>
                </li>
              ) : null}
              {a.price_cents ? (
                <li className="flex gap-3">
                  <DollarSign className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                  <span>
                    Costo: {formatCents(a.price_cents)}
                    {a.deposit_cents ? (
                      <>
                        <br />
                        <span className="text-[#666]">
                          Depósito para reservar: {formatCents(a.deposit_cents)} (no reembolsable)
                        </span>
                      </>
                    ) : null}
                  </span>
                </li>
              ) : null}
            </ul>
            {a.contact_info ? (
              <div className="text-[16px] leading-[24px] text-[#444]">
                <p className="mb-1 text-[14px] tracking-[1.2px] text-[#888] uppercase">
                  Para más información
                </p>
                <p className="whitespace-pre-line">{a.contact_info}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-sm md:p-8">
            {!a.is_open ? (
              <Closed text="Las inscripciones para esta actividad ya están cerradas." />
            ) : a.is_full ? (
              <Closed text="Lo sentimos, ya no quedan espacios disponibles." />
            ) : (
              <RegistrationForm
                slug={slug}
                priceCents={a.price_cents}
                depositCents={a.deposit_cents}
                paymentInstructions={a.payment_instructions}
              />
            )}
          </div>
        </div>
      </div>
    </SitePage>
  );
}

function Closed({ text }: { text: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-[21px] leading-[28px]">{text}</p>
    </div>
  );
}
