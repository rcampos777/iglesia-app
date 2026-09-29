import type { Metadata } from "next";
import { SitePage } from "@/components/sitio/site-page";
import { VideoCard } from "@/components/sitio/video-card";
import { publicSettings, publicVideos } from "@/lib/data/site";
import { formatDateKey } from "@/lib/datetime";
import { safe } from "@/lib/site/load";

export const revalidate = 300;
export const metadata: Metadata = { title: "Predicaciones" };

export default async function SiteVideosPage() {
  const [videos, settings] = await Promise.all([
    safe("videos", publicVideos(60), []),
    safe("ajustes", publicSettings(), null),
  ]);
  return (
    <SitePage eyebrow="Palabra" title="Predicaciones" lead="Mensajes recientes de nuestros cultos.">
      <div className="mx-auto max-w-6xl space-y-10 px-[19px] pb-20 md:px-8">
        {videos.length === 0 ? (
          <p className="text-[18px] text-white/60">Pronto compartiremos predicaciones.</p>
        ) : (
          <ul className="grid gap-10 md:grid-cols-2">
            {videos.map((v) => (
              <li key={v.id}>
                <VideoCard
                  id={v.youtube_id}
                  title={v.title}
                  subtitle={
                    v.recorded_on
                      ? formatDateKey(v.recorded_on, true).replace(/^[^,]+,\s*/, "")
                      : undefined
                  }
                />
                {v.description ? (
                  <p className="mt-2 text-[16px] leading-relaxed text-white/60">{v.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {settings?.youtube_url ? (
          <a
            href={settings.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-[52px] items-center rounded-full bg-[#F1E5C6] px-6 text-[18px] font-medium text-[#1D191A]"
          >
            Ver el canal de YouTube
          </a>
        ) : null}
      </div>
    </SitePage>
  );
}
