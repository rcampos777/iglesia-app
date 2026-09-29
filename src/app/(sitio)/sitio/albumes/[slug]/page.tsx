import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SitePage } from "@/components/sitio/site-page";
import { PhotoGrid } from "@/components/sitio/photo-lightbox";
import { publicAlbum } from "@/lib/data/site";
import { siteMediaUrl } from "@/lib/site/media";
import { safe } from "@/lib/site/load";

export const revalidate = 300;

async function load(slug: string) {
  return /^[a-z0-9-]{1,80}$/.test(slug) ? safe("álbum", publicAlbum(slug), null) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const data = await load((await params).slug);
  return data ? { title: data.album.title, description: data.album.description ?? undefined } : {};
}

export default async function SiteAlbumPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { album, photos } = data;
  return (
    <SitePage eyebrow="Álbum" title={album.title} lead={album.description ?? undefined}>
      <div className="mx-auto max-w-6xl space-y-8 px-[19px] pb-20 md:px-8">
        {photos.length === 0 ? (
          <p className="text-[18px] text-white/60">Este álbum todavía no tiene fotos.</p>
        ) : (
          <PhotoGrid
            photos={photos.map((p) => ({
              id: p.media_id,
              thumb: siteMediaUrl(p.media.thumb_path),
              full: siteMediaUrl(p.media.storage_path),
              alt: p.media.alt_text,
              caption: p.caption,
            }))}
          />
        )}
        <Link
          href="/sitio/albumes"
          className="inline-flex items-center gap-2 text-[16px] text-white/60 hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Todos los álbumes
        </Link>
      </div>
    </SitePage>
  );
}
