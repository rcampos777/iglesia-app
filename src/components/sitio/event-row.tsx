import Link from "next/link";
import { cn } from "@/lib/utils";

const dayFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: "America/Puerto_Rico",
  day: "numeric",
});
const monFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: "America/Puerto_Rico",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: "America/Puerto_Rico",
  hour: "numeric",
  minute: "2-digit",
});
const weekdayFmt = new Intl.DateTimeFormat("es-PR", {
  timeZone: "America/Puerto_Rico",
  weekday: "long",
});

export function timeRange(startsAt: string, endsAt?: string | null) {
  return endsAt
    ? `${timeFmt.format(new Date(startsAt))} – ${timeFmt.format(new Date(endsAt))}`
    : timeFmt.format(new Date(startsAt));
}

/** Fila de evento con tarjeta de fecha (68×90), como en el diseño. */
export function EventRow({
  title,
  startsAt,
  endsAt,
  href,
  cream,
  faded,
  subtitle,
}: {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  href?: string;
  cream?: boolean;
  faded?: boolean;
  subtitle?: string;
}) {
  const d = new Date(startsAt);
  const body = (
    <>
      <span
        className={cn(
          "flex h-[90px] w-[68px] shrink-0 flex-col items-center justify-center rounded-2xl text-[#1D191A]",
          cream ? "bg-[#F1E5C6]" : "bg-white ring-1 ring-black/10",
        )}
      >
        <span className="text-[34px] leading-none font-medium">{dayFmt.format(d)}</span>
        <span className="text-[18px] capitalize">{monFmt.format(d).replace(".", "")}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-[21px] leading-[26px] text-[#1D191A]">{title}</span>
        <span className="mt-1 block text-[17px] text-[#999999] first-letter:uppercase">
          {subtitle ?? `${weekdayFmt.format(d)} · ${timeRange(startsAt, endsAt)}`}
        </span>
      </span>
    </>
  );
  const cls = cn("flex items-center gap-4", faded && "opacity-50");
  return href ? (
    <Link href={href} className={cn(cls, "rounded-2xl transition hover:opacity-80")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
