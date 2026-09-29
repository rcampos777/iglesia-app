"use client";

import Image from "next/image";
import { useState } from "react";
import { Play } from "lucide-react";

/**
 * Miniatura que carga el reproductor de YouTube solo al tocarla
 * (youtube-nocookie: sin cookies de seguimiento hasta que la persona juega).
 */
export function VideoCard({
  id,
  title,
  subtitle,
}: {
  id: string;
  title: string;
  subtitle?: string;
}) {
  const [play, setPlay] = useState(false);
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-[24px] bg-black">
        {play ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlay(true)}
            className="group absolute inset-0"
            aria-label={`Reproducir: ${title}`}
          >
            <Image
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              fill
              unoptimized
              className="object-cover"
            />
            <span className="absolute inset-0 bg-black/30" />
            <span className="absolute top-1/2 left-1/2 flex size-[65px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#F1E5C6] text-[#1D191A] transition group-hover:scale-110">
              <Play className="ml-1 size-7 fill-current" aria-hidden />
            </span>
          </button>
        )}
      </div>
      <p className="mt-4 text-[21px] leading-[26px] text-white">{title}</p>
      {subtitle ? <p className="text-[16px] text-white/50">{subtitle}</p> : null}
    </div>
  );
}
