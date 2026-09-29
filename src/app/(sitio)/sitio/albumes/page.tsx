import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SitePage } from "@/components/sitio/site-page";
import { publicAlbums } from "@/lib/data/site";
import { siteMediaUrl } from "@/lib/site/media";
import { safe } from "@/lib/site/load";

export const revalidate = 300;
export const metadata: Metadata = { title: "Álbumes" };

const dateFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export default async function SiteAlbumsPage() {
  const albums = await safe("álbumes", publicAlbums(120), []);
  return (
    <SitePage eyebrow="Así vivimos la fe" title="Álbumes" lead="Momentos de nuestra congregación.">
      <div className="mx-auto max-w-6xl px-[19px] pb-20 md:px-8">
        {albums.length === 0 ? (
          <p className="text-[18px] text-white/60">Pronto compartiremos fotos.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((a) => (
              <li key={a.id}>
                <Link href={`/sitio/albumes/${a.slug}`} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-white/5">
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
                  <p className="mt-4 text-[21px] leading-[26px] text-white">{a.title}</p>
                  <p className="text-[16px] text-white/50">
                    {a.album_date
                      ? `${dateFmt.format(new Date(`${a.album_date}T12:00:00Z`))} · `
                      : ""}
                    {a.photoCount} {a.photoCount === 1 ? "foto" : "fotos"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SitePage>
  );
}
