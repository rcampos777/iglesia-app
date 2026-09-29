import Image from "next/image";
import Link from "next/link";
import type { PublicSettings } from "@/lib/data/site";

export function SiteFooter({ s }: { s: PublicSettings }) {
  const socials = [
    ["Instagram", s.instagram_url],
    ["Facebook", s.facebook_url],
    ["YouTube", s.youtube_url],
  ].filter((x): x is [string, string] => Boolean(x[1]));
  return (
    <footer className="bg-[#141112] text-white/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-[19px] py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/logo-mark.png"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-lg bg-[#F5F0E8] p-1"
            />
            <span className="text-[17px] text-white">{s.hero_title}</span>
          </div>
          {s.mission_text ? (
            <p className="max-w-sm text-[15px] leading-relaxed">{s.mission_text}</p>
          ) : null}
        </div>
        <nav aria-label="Pie de página" className="flex flex-col gap-2 text-[15px]">
          <Link href="/sitio#nosotros" className="hover:text-white">
            Nosotros
          </Link>
          <Link href="/sitio/eventos" className="hover:text-white">
            Eventos
          </Link>
          <Link href="/sitio/videos" className="hover:text-white">
            Predicaciones
          </Link>
          <Link href="/sitio/albumes" className="hover:text-white">
            Álbumes
          </Link>
          <a href={s.portal_url} className="hover:text-white">
            Portal de miembros
          </a>
        </nav>
        {socials.length ? (
          <div className="flex flex-col gap-2 text-[15px]">
            {socials.map(([label, url]) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                {label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-[19px] py-5 text-[13px] text-white/40 md:px-8">
          © {new Date().getFullYear()} {s.hero_title}
        </p>
      </div>
    </footer>
  );
}
