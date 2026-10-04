import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { SitePage } from "@/components/sitio/site-page";
import { eventDateText, eventTimeText, postWhen } from "@/lib/site/event-time";
import { publicPost } from "@/lib/data/site";
import { siteMediaUrl } from "@/lib/site/media";
import { safe } from "@/lib/site/load";

export const revalidate = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function load(id: string) {
  return UUID_RE.test(id) ? safe("evento", publicPost(id), null) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const post = await load((await params).id);
  return post ? { title: post.title, description: post.body?.slice(0, 160) } : {};
}

export default async function SiteEventPage({ params }: { params: Promise<{ id: string }> }) {
  const post = await load((await params).id);
  if (!post) notFound();
  const when = post.kind === "evento" ? postWhen(post) : null;
  return (
    <SitePage eyebrow={post.kind === "evento" ? "Evento" : "Anuncio"} title={post.title}>
      <div className="bg-[#F5F0E8] text-[#1D191A]">
        <div className="mx-auto grid max-w-6xl gap-10 px-[19px] py-12 md:grid-cols-[1fr_1.2fr] md:px-8 md:py-16">
          <div className="space-y-5">
            {when ? (
              <p className="flex gap-3 text-[18px]">
                <CalendarDays className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                <span>
                  {eventDateText(when, true)}
                  {eventTimeText(when) ? (
                    <>
                      <br />
                      <span className="text-[#888]">{eventTimeText(when)}</span>
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
            {post.location ? (
              <p className="flex gap-3 text-[18px]">
                <MapPin className="mt-1 size-5 shrink-0 text-[#8a7a5a]" aria-hidden />
                {post.location}
              </p>
            ) : null}
            {post.body ? (
              <p className="text-[18px] leading-[28px] whitespace-pre-line text-[#444]">
                {post.body}
              </p>
            ) : null}
            {post.link_url ? (
              <a
                href={post.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-[52px] w-fit items-center gap-3 rounded-full bg-[#1D191A] px-6 text-[18px] font-medium text-[#F1E5C6]"
              >
                {post.link_label || "Más información"}
                <ArrowUpRight className="size-5" aria-hidden />
              </a>
            ) : null}
            <Link
              href="/sitio/eventos"
              className="inline-flex items-center gap-2 text-[16px] text-[#888] hover:text-[#1D191A]"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Todos los eventos
            </Link>
          </div>
          {post.media ? (
            <div className="relative aspect-[4/3] overflow-hidden rounded-[28px]">
              <Image
                src={siteMediaUrl(post.media.storage_path)}
                alt={post.media.alt_text}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          ) : null}
        </div>
      </div>
    </SitePage>
  );
}
