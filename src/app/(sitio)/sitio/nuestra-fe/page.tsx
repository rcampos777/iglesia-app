import type { Metadata } from "next";
import { SitePage } from "@/components/sitio/site-page";
import { publicSettings } from "@/lib/data/site";
import { FALLBACK_SETTINGS, safe } from "@/lib/site/load";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Nuestra fe",
  description: "Visión, misión y fundamentos de nuestra fe.",
};

export default async function FaithPage() {
  const s = (await safe("ajustes", publicSettings(), null)) ?? FALLBACK_SETTINGS;
  const beliefs = (s.beliefs_text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <SitePage eyebrow="Quiénes somos" title="Nuestra fe">
      {s.vision_text || s.mission_text ? (
        <div className="mx-auto grid max-w-6xl gap-8 px-[19px] pb-14 md:grid-cols-2 md:gap-14 md:px-8">
          {s.vision_text ? (
            <section aria-labelledby="vision">
              <h2 id="vision" className="text-[14px] tracking-[1.2px] text-white/50 uppercase">
                Visión
              </h2>
              <p className="mt-3 text-[28px] leading-[34px] font-light tracking-[-0.6px] text-[#F1E5C6] md:text-[34px] md:leading-[40px]">
                {s.vision_text}
              </p>
            </section>
          ) : null}
          {s.mission_text ? (
            <section aria-labelledby="mision">
              <h2 id="mision" className="text-[14px] tracking-[1.2px] text-white/50 uppercase">
                Misión
              </h2>
              <p className="mt-3 text-[21px] leading-[30px] text-white/[0.77]">{s.mission_text}</p>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="bg-[#F5F0E8] text-[#1D191A]">
        <section
          aria-labelledby="fundamentos"
          className="mx-auto max-w-3xl px-[19px] py-12 md:px-8 md:py-16"
        >
          <h2
            id="fundamentos"
            className="text-[34px] leading-[40px] font-light tracking-[-0.8px] md:text-[38px]"
          >
            Fundamentos de nuestra fe
          </h2>
          {beliefs.length === 0 ? (
            <p className="mt-6 text-[17px] text-[#666]">Pronto publicaremos esta sección.</p>
          ) : (
            <ol className="mt-8 space-y-6">
              {beliefs.map((b, i) => (
                <li key={b.slice(0, 40)} className="flex gap-4">
                  <span
                    className="w-8 shrink-0 pt-0.5 text-right text-[17px] font-medium text-[#8a7a5a] tabular-nums"
                    aria-hidden
                  >
                    {i + 1}.
                  </span>
                  <p className="text-[17px] leading-[27px] text-[#444]">{b}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </SitePage>
  );
}
