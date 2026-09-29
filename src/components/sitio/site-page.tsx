import type { ReactNode } from "react";
import { publicSettings } from "@/lib/data/site";
import { FALLBACK_SETTINGS, safe } from "@/lib/site/load";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

/** Página interna del sitio: encabezado oscuro, título grande y pie. */
export async function SitePage({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  const s = (await safe("ajustes", publicSettings(), null)) ?? FALLBACK_SETTINGS;
  return (
    <>
      <SiteHeader name={s.hero_title} portalUrl={s.portal_url} />
      <main className="site-fade">
        <div className="mx-auto max-w-6xl px-[19px] pt-6 pb-10 md:px-8 md:pt-12">
          {eyebrow ? (
            <p className="mb-3 text-[14px] tracking-[1.2px] text-white/50 uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="text-[52px] leading-[52px] font-light tracking-[-2.5px] text-[#F1E5C6] md:text-[72px] md:leading-[72px]">
            {title}
          </h1>
          {lead ? (
            <p className="mt-4 max-w-2xl text-[21px] leading-[27px] text-white/60">{lead}</p>
          ) : null}
        </div>
        {children}
      </main>
      <SiteFooter s={s} />
    </>
  );
}
