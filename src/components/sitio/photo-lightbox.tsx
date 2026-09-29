"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type LightboxPhoto = {
  id: string;
  thumb: string;
  full: string;
  alt: string;
  caption: string | null;
};

/** Cuadrícula de fotos con visor a pantalla completa (flechas, Esc, deslizar). */
export function PhotoGrid({ photos }: { photos: LightboxPhoto[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);
  const close = useCallback(() => setIndex(null), []);
  const go = useCallback(
    (d: number) => setIndex((i) => (i === null ? i : (i + d + photos.length) % photos.length)),
    [photos.length],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [index, close, go]);

  const current = index === null ? null : photos[index];

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-[16px] bg-white/5"
              aria-label={`Ver foto ${i + 1} de ${photos.length}${p.alt ? `: ${p.alt}` : ""}`}
            >
              <Image
                src={p.thumb}
                alt={p.alt}
                fill
                unoptimized
                loading="lazy"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>
      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${index! + 1} de ${photos.length}`}
          className="site-fade-fast fixed inset-0 z-[100] flex flex-col bg-black/95"
          onTouchStart={(e) => setTouchX(e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const x = e.changedTouches[0]?.clientX;
            if (touchX !== null && x !== undefined && Math.abs(x - touchX) > 50)
              go(x < touchX ? 1 : -1);
            setTouchX(null);
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white/70">
            <span className="text-[15px] tabular-nums">
              {index! + 1} / {photos.length}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="rounded-full p-2 hover:bg-white/10"
              autoFocus
            >
              <X className="size-6" aria-hidden />
            </button>
          </div>
          <div className="relative flex-1">
            <Image
              src={current.full}
              alt={current.alt}
              fill
              unoptimized
              className="object-contain"
            />
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Anterior"
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                >
                  <ChevronLeft className="size-7" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Siguiente"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                >
                  <ChevronRight className="size-7" aria-hidden />
                </button>
              </>
            ) : null}
          </div>
          {current.caption ? (
            <p className="px-4 py-4 text-center text-[16px] text-white/80">{current.caption}</p>
          ) : (
            <div className="h-6" />
          )}
        </div>
      ) : null}
    </>
  );
}
