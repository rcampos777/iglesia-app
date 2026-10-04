import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Mail, MapPin, Phone, Play } from "lucide-react";
import type { AlbumCard, PublicSettings, WithMedia } from "@/lib/data/site";
import type { SiteMinistryRow, SitePostRow, SiteTeamRow, SiteVideoRow } from "@/types/database";
import type { Occurrence, ScheduleRule } from "@/lib/site/schedule";
import { siteMediaUrl } from "@/lib/site/media";
import { formatLocalTime } from "@/lib/datetime";
import { weekdayLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Typewriter } from "./typewriter";
import { EventRow } from "./event-row";
import { eventDateText, eventTimeText } from "@/lib/site/event-time";

export type SiteHomeData = {
  settings: PublicSettings;
  schedule: ScheduleRule[];
  upcoming: Occurrence[];
  announcements: WithMedia<SitePostRow>[];
  albums: AlbumCard[];
  videos: SiteVideoRow[];
  ministries: WithMedia<SiteMinistryRow>[];
  team: WithMedia<SiteTeamRow>[];
};

function QuoteMark() {
  return (
    <svg width="28" height="24" viewBox="0 0 28 24" aria-hidden className="text-[#F1E5C6]">
      <path
        fill="currentColor"
        d="M0 24V14.4C0 6.2 4.1 1.4 11.2 0l1.4 2.8C8.6 4.1 6.6 6.7 6.3 10.4H12V24H0Zm16 0V14.4C16 6.2 20.1 1.4 27.2 0l.8 2.8c-4 1.3-6 3.9-6.3 7.6H28V24H16Z"
      />
    </svg>
  );
}

/** Estrella de cuatro puntas (decorativa), en vez del icono del diseño original. */
function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M24 0c1.6 12.8 9.6 20.8 24 24-14.4 3.2-22.4 11.2-24 24C22.4 35.2 14.4 27.2 0 24 14.4 20.8 22.4 12.8 24 0Z"
      />
    </svg>
  );
}

function paragraphs(text: string | null) {
  return (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function SiteHome({ data }: { data: SiteHomeData }) {
  const { settings: s, schedule, upcoming, announcements, albums, videos, ministries, team } = data;
  const heroImg = s.heroMedia ? siteMediaUrl(s.heroMedia.storage_path) : null;
  const featured = team.find((t) => t.media && t.bio) ?? null;
  const quote = featured?.bio ?? s.mission_text;
  const portrait = featured?.media ?? s.aboutMedia;
  const next = upcoming[0] ?? null;
  const video = videos[0] ?? null;
  const avatars = team.filter((t) => t.media).slice(0, 4);
  const about = paragraphs(s.about_text);
  const mapSrc = s.map_query
    ? `https://www.google.com/maps?q=${encodeURIComponent(s.map_query)}&output=embed`
    : null;

  return (
    <>
      {/* ---------- Portada (pantalla 2 del diseño) ---------- */}
      <section id="inicio" className="site-fade relative">
        <div className="relative h-[472px] overflow-hidden md:h-[640px]">
          {heroImg ? (
            <Image
              src={heroImg}
              alt={s.heroMedia?.alt_text ?? ""}
              fill
              priority
              unoptimized
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(120%_140%_at_15%_0%,#4a2a24_0%,#1D191A_60%)]" />
          )}
          <div className="absolute inset-0 bg-black/15" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#1D191A]/70 to-transparent" />
          <SiteHeader name={s.hero_title} portalUrl={s.portal_url} overlay />
          {avatars.length ? (
            <div className="absolute bottom-[30px] left-[19px] flex -space-x-3 md:left-8">
              {avatars.map((t) => (
                <Image
                  key={t.id}
                  src={siteMediaUrl(t.media!.thumb_path)}
                  alt=""
                  width={53}
                  height={53}
                  unoptimized
                  className="size-[53px] rounded-full object-cover ring-2 ring-[#1D191A]"
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="mx-auto max-w-6xl px-[19px] pt-12 pb-10 md:grid md:grid-cols-[1.3fr_1fr] md:items-end md:gap-12 md:px-8 md:pt-16">
          <div>
            <p className="mb-4 text-[15px] tracking-[1.2px] text-white/50 uppercase">
              {s.hero_eyebrow}
            </p>
            <Typewriter
              as="h1"
              text={s.hero_title}
              speed={45}
              delay={300}
              className="text-[52px] leading-[52px] font-light tracking-[-2.5px] text-[#F1E5C6] md:text-[84px] md:leading-[84px] md:tracking-[-4px]"
            />
            {s.hero_subtitle ? (
              <p className="mt-5 max-w-xl text-[21px] leading-[27px] text-white/60">
                {s.hero_subtitle}
              </p>
            ) : null}
          </div>
          <div className="mt-10 grid gap-3 md:mt-0">
            <a
              href="#horarios"
              className="flex h-[52px] items-center justify-between rounded-full bg-[#F1E5C6] px-6 text-[21px] font-medium text-[#1D191A] transition hover:bg-white"
            >
              Visítanos
              <ArrowRight className="size-6" aria-hidden />
            </a>
            <a
              href={s.portal_url}
              className="flex h-[52px] items-center justify-between rounded-full px-6 text-[18px] text-white/80 ring-1 ring-white/25 transition hover:text-white hover:ring-white/60"
            >
              Portal de miembros
              <ArrowUpRight className="size-5" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {/* ---------- Cita + próximo culto (pantalla 1 del diseño) ---------- */}
      {quote || next ? (
        <section aria-label="Palabra" className="site-fade relative bg-[#1D191A]">
          <div className="mx-auto max-w-6xl md:grid md:grid-cols-2 md:gap-12 md:px-8 md:py-20">
            {quote ? (
              <div className="relative min-h-[430px] px-[19px] pt-10 md:min-h-0 md:px-0 md:pt-0">
                {featured ? (
                  <p
                    className="absolute top-[140px] left-[19px] rotate-180 text-[14px] tracking-[1.2px] whitespace-nowrap text-white/50 [writing-mode:vertical-rl] md:hidden"
                    aria-hidden
                  >
                    <span className="font-medium">{featured.name}</span>
                    {featured.role_title ? <span> / {featured.role_title}</span> : null}
                  </p>
                ) : null}
                {portrait ? (
                  <div className="relative ml-auto h-[300px] w-[240px] overflow-hidden rounded-sm md:mx-0 md:h-[420px] md:w-full md:max-w-[360px]">
                    <Image
                      src={siteMediaUrl(portrait.storage_path)}
                      alt={featured ? featured.name : portrait.alt_text}
                      fill
                      unoptimized
                      sizes="(min-width: 768px) 360px, 240px"
                      className="object-cover"
                    />
                  </div>
                ) : null}
                <div className="mt-8 space-y-4">
                  <QuoteMark />
                  <blockquote className="max-w-[336px] text-[20px] leading-[27px] text-white/[0.77] md:max-w-md md:text-[24px] md:leading-[32px]">
                    {quote}
                  </blockquote>
                  {featured ? (
                    <p className="hidden text-[14px] tracking-[1.2px] text-white/50 md:block">
                      <span className="font-medium">{featured.name}</span>
                      {featured.role_title ? ` / ${featured.role_title}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {next ? (
              <div className="mt-10 md:mt-0 md:self-end">
                <div className="relative flex min-h-[245px] flex-col justify-between rounded-t-[28px] bg-white px-[19px] pt-7 pb-8 text-[#1a1a1a] md:rounded-[28px] md:px-8">
                  <div>
                    <p className="mb-2 text-[13px] tracking-[1.2px] text-[#888888] uppercase">
                      Próximo
                    </p>
                    <h2 className="text-[36px] leading-[40px] font-medium tracking-[-0.5px]">
                      {next.title}
                    </h2>
                    <p className="mt-2 text-[17px] text-[#888888]">
                      {[eventDateText(next), eventTimeText(next)].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <Link
                    href={next.href ?? "#horarios"}
                    className="mt-6 inline-flex w-fit items-center gap-2 text-[17px] font-medium hover:underline"
                  >
                    Ver más
                    <ArrowRight className="size-5" aria-hidden />
                  </Link>
                  <Spark className="absolute right-6 bottom-6 size-12 text-[#1D191A]" />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ---------- Predicación + próximos (pantalla 3 del diseño) ---------- */}
      <section aria-labelledby="proximos" className="site-fade bg-white">
        {video ? (
          <a
            href={`https://www.youtube.com/watch?v=${video.youtube_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block h-[345px] overflow-hidden md:h-[480px]"
            aria-label={`Ver predicación: ${video.title}`}
          >
            <Image
              src={`https://i.ytimg.com/vi/${video.youtube_id}/maxresdefault.jpg`}
              alt=""
              fill
              unoptimized
              sizes="100vw"
              className="object-cover transition duration-500 group-hover:scale-[1.03]"
            />
            <span className="absolute inset-0 bg-black/30" />
            <span className="absolute top-1/2 left-1/2 flex size-[65px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#F1E5C6] text-[#1D191A] transition group-hover:scale-110 md:size-[84px]">
              <Play className="ml-1 size-7 fill-current" aria-hidden />
            </span>
            <span className="absolute inset-x-0 bottom-0 px-[19px] pb-6 text-[17px] text-white/90 md:px-8">
              {video.title}
            </span>
          </a>
        ) : null}
        <div className="relative">
          <div className="absolute inset-x-0 top-0 h-[220px] bg-[#1D191A]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-[19px] pt-10 pb-14 md:px-8">
            <div className="flex items-end justify-between gap-4">
              <h2 id="proximos" className="text-[38px] leading-tight tracking-[-0.8px] text-white">
                Próximos
              </h2>
              <Link
                href="/sitio/eventos"
                className="pb-2 text-[15px] text-white/60 hover:text-white"
              >
                Ver todos
              </Link>
            </div>
            <div className="mt-8 rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.12)] md:p-8">
              {upcoming.length === 0 ? (
                <p className="text-[17px] text-[#999999]">
                  Pronto anunciaremos nuevas actividades.
                </p>
              ) : (
                <ul className="grid gap-[22px] md:grid-cols-2 md:gap-x-10">
                  {upcoming.slice(0, 4).map((o, i) => (
                    <li key={`${o.title}-${o.startsAt}`}>
                      <EventRow
                        title={o.title}
                        startsAt={o.startsAt}
                        endsAt={o.endsAt}
                        startHasTime={o.startHasTime}
                        endHasTime={o.endHasTime}
                        href={o.href}
                        cream={i > 0}
                        faded={i === 3 && upcoming.length > 4}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Anuncios ---------- */}
      {announcements.length ? (
        <section aria-labelledby="anuncios" className="site-fade bg-[#F5F0E8] text-[#1D191A]">
          <div className="mx-auto max-w-6xl px-[19px] py-16 md:px-8">
            <h2 id="anuncios" className="text-[38px] leading-tight tracking-[-0.8px]">
              Anuncios
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {announcements.map((a) => (
                <li key={a.id} className="overflow-hidden rounded-[24px] bg-white">
                  {a.media ? (
                    <div className="relative aspect-[16/10]">
                      <Image
                        src={siteMediaUrl(a.media.thumb_path)}
                        alt={a.media.alt_text}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2 p-5">
                    <h3 className="text-[21px] leading-[26px]">{a.title}</h3>
                    {a.body ? (
                      <p className="line-clamp-4 text-[16px] leading-relaxed text-[#666]">
                        {a.body}
                      </p>
                    ) : null}
                    {a.link_url ? (
                      <a
                        href={a.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[16px] font-medium hover:underline"
                      >
                        {a.link_label || "Más información"}
                        <ArrowUpRight className="size-4" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ---------- Nosotros + ministerios ---------- */}
      <section id="nosotros" aria-labelledby="nosotros-t" className="site-fade bg-[#1D191A]">
        <div className="mx-auto max-w-6xl px-[19px] py-16 md:grid md:grid-cols-2 md:gap-14 md:px-8 md:py-24">
          <div>
            <p className="mb-3 text-[14px] tracking-[1.2px] text-white/50 uppercase">
              Quiénes somos
            </p>
            <h2
              id="nosotros-t"
              className="text-[44px] leading-[46px] font-light tracking-[-1.5px] text-[#F1E5C6]"
            >
              {s.about_title}
            </h2>
            <div className="mt-6 space-y-4 text-[18px] leading-[28px] text-white/[0.77]">
              {about.length ? (
                about.map((p) => <p key={p.slice(0, 40)}>{p}</p>)
              ) : s.hero_subtitle ? (
                <p>{s.hero_subtitle}</p>
              ) : null}
            </div>
          </div>
          {s.aboutMedia ? (
            <div className="relative mt-10 aspect-[4/5] overflow-hidden rounded-[28px] md:mt-0">
              <Image
                src={siteMediaUrl(s.aboutMedia.storage_path)}
                alt={s.aboutMedia.alt_text}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          ) : null}
        </div>
        {ministries.length ? (
          <div className="mx-auto max-w-6xl px-[19px] pb-16 md:px-8 md:pb-24">
            <h3 className="text-[30px] tracking-[-0.6px] text-white">Ministerios</h3>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ministries.map((m) => (
                <li
                  key={m.id}
                  className="overflow-hidden rounded-[24px] bg-white/[0.04] ring-1 ring-white/10"
                >
                  {m.media ? (
                    <div className="relative aspect-[16/10]">
                      <Image
                        src={siteMediaUrl(m.media.thumb_path)}
                        alt={m.media.alt_text}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="p-5">
                    <p className="text-[21px] leading-[26px] text-white">{m.name}</p>
                    {m.description ? (
                      <p className="mt-2 text-[16px] leading-relaxed text-white/60">
                        {m.description}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ---------- Equipo pastoral ---------- */}
      {team.length ? (
        <section aria-labelledby="equipo" className="site-fade bg-[#F5F0E8] text-[#1D191A]">
          <div className="mx-auto max-w-6xl px-[19px] py-16 md:px-8 md:py-24">
            <h2 id="equipo" className="text-[38px] leading-tight tracking-[-0.8px]">
              Equipo pastoral
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {team.map((t) => (
                <li key={t.id}>
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[24px] bg-[#e7dfd2]">
                    {t.media ? (
                      <Image
                        src={siteMediaUrl(t.media.thumb_path)}
                        alt={t.name}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <p className="mt-4 text-[21px] leading-[26px]">{t.name}</p>
                  {t.role_title ? <p className="text-[16px] text-[#888]">{t.role_title}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ---------- Álbumes ---------- */}
      {albums.length ? (
        <section aria-labelledby="albumes" className="site-fade bg-white text-[#1D191A]">
          <div className="mx-auto max-w-6xl px-[19px] py-16 md:px-8 md:py-24">
            <div className="flex items-end justify-between gap-4">
              <h2 id="albumes" className="text-[38px] leading-tight tracking-[-0.8px]">
                Momentos
              </h2>
              <Link
                href="/sitio/albumes"
                className="pb-2 text-[15px] text-[#888] hover:text-[#1D191A]"
              >
                Ver álbumes
              </Link>
            </div>
            <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
              {albums.slice(0, 6).map((a, i) => (
                <li key={a.id} className={cn(i === 0 && "col-span-2 md:col-span-1")}>
                  <Link href={`/sitio/albumes/${a.slug}`} className="group block">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-[20px] bg-[#eee]">
                      {a.cover ? (
                        <Image
                          src={siteMediaUrl(a.cover.thumb_path)}
                          alt={a.cover.alt_text}
                          fill
                          unoptimized
                          className="object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : null}
                    </div>
                    <p className="mt-3 text-[18px] leading-tight">{a.title}</p>
                    <p className="text-[15px] text-[#999]">
                      {a.photoCount} {a.photoCount === 1 ? "foto" : "fotos"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ---------- Horarios ---------- */}
      <section id="horarios" aria-labelledby="horarios-t" className="site-fade bg-[#1D191A]">
        <div className="mx-auto max-w-6xl px-[19px] py-16 md:grid md:grid-cols-2 md:gap-14 md:px-8 md:py-24">
          <div>
            <p className="mb-3 text-[14px] tracking-[1.2px] text-white/50 uppercase">
              Te esperamos
            </p>
            <h2
              id="horarios-t"
              className="text-[44px] leading-[46px] font-light tracking-[-1.5px] text-[#F1E5C6]"
            >
              Horarios de servicio
            </h2>
            <p className="mt-4 text-[18px] text-white/60">
              Ven tal como eres. Todos son bienvenidos.
            </p>
          </div>
          <ul className="mt-8 divide-y divide-white/10 md:mt-0">
            {schedule.length === 0 ? (
              <li className="py-4 text-white/60">Pronto publicaremos los horarios.</li>
            ) : (
              schedule.map((r) => (
                <li
                  key={`${r.weekday}-${r.local_time}`}
                  className="flex items-baseline justify-between gap-4 py-5"
                >
                  <span>
                    <span className="block text-[21px] text-white">{weekdayLabels[r.weekday]}</span>
                    <span className="text-[16px] text-white/50">{r.name}</span>
                  </span>
                  <span className="text-[21px] whitespace-nowrap text-[#F1E5C6]">
                    {formatLocalTime(r.local_time)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {/* ---------- Contacto ---------- */}
      <section
        id="contacto"
        aria-labelledby="contacto-t"
        className="site-fade bg-[#F5F0E8] text-[#1D191A]"
      >
        <div className="mx-auto max-w-6xl px-[19px] py-16 md:grid md:grid-cols-2 md:gap-14 md:px-8 md:py-24">
          <div>
            <h2 id="contacto-t" className="text-[38px] leading-tight tracking-[-0.8px]">
              Cómo llegar
            </h2>
            <ul className="mt-8 space-y-5 text-[17px]">
              {s.address ? (
                <li className="flex gap-3">
                  <MapPin className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                  <span>{s.address}</span>
                </li>
              ) : null}
              {s.phone ? (
                <li className="flex gap-3">
                  <Phone className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                  <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                    {s.phone}
                  </a>
                </li>
              ) : null}
              {s.email ? (
                <li className="flex gap-3">
                  <Mail className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                  <a href={`mailto:${s.email}`} className="break-all hover:underline">
                    {s.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          {mapSrc ? (
            <div className="mt-10 aspect-[4/3] overflow-hidden rounded-[28px] ring-1 ring-black/10 md:mt-0">
              <iframe
                src={mapSrc}
                title="Mapa de ubicación"
                loading="lazy"
                className="size-full border-0"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          ) : null}
        </div>
      </section>

      <SiteFooter s={s} />
    </>
  );
}
