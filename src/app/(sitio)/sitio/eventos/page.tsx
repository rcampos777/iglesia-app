import type { Metadata } from "next";
import { SitePage } from "@/components/sitio/site-page";
import { EventRow } from "@/components/sitio/event-row";
import { publicPastEvents, publicSchedule, publicUpcomingEvents } from "@/lib/data/site";
import { upcomingServices } from "@/lib/site/schedule";
import { safe } from "@/lib/site/load";

export const revalidate = 300;
export const metadata: Metadata = { title: "Eventos" };

export default async function SiteEventsPage() {
  const [events, past, schedule] = await Promise.all([
    safe("eventos", publicUpcomingEvents(40), []),
    safe("eventos pasados", publicPastEvents(12), []),
    safe("horarios", publicSchedule(), []),
  ]);
  const services = upcomingServices(schedule, 13);

  return (
    <SitePage eyebrow="Agenda" title="Eventos" lead="Actividades especiales y los próximos cultos.">
      <div className="bg-white text-[#1D191A]">
        <div className="mx-auto grid max-w-6xl gap-12 px-[19px] py-12 md:grid-cols-2 md:px-8 md:py-16">
          <section aria-labelledby="especiales">
            <h2 id="especiales" className="mb-6 text-[30px] tracking-[-0.6px]">
              Actividades especiales
            </h2>
            {events.length === 0 ? (
              <p className="text-[17px] text-[#999]">
                No hay actividades especiales anunciadas por ahora.
              </p>
            ) : (
              <ul className="grid gap-[22px]">
                {events.map((e, i) => (
                  <li key={e.id}>
                    <EventRow
                      title={e.title}
                      startsAt={e.starts_at!}
                      endsAt={e.ends_at}
                      startHasTime={e.start_has_time}
                      endHasTime={e.end_has_time}
                      href={`/sitio/eventos/${e.id}`}
                      cream={i % 2 === 1}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="cultos">
            <h2 id="cultos" className="mb-6 text-[30px] tracking-[-0.6px]">
              Próximos cultos
            </h2>
            <ul className="grid gap-[22px]">
              {services.map((o, i) => (
                <li key={o.startsAt + o.title}>
                  <EventRow title={o.title} startsAt={o.startsAt} cream={i % 2 === 0} />
                </li>
              ))}
            </ul>
          </section>
        </div>
        {past.length ? (
          <section aria-labelledby="pasados" className="mx-auto max-w-6xl px-[19px] pb-16 md:px-8">
            <h2 id="pasados" className="mb-6 text-[24px] text-[#888]">
              Eventos pasados
            </h2>
            <ul className="grid gap-[22px] opacity-70 md:grid-cols-2">
              {past.map((e) => (
                <li key={e.id}>
                  <EventRow
                    title={e.title}
                    startsAt={e.starts_at!}
                    endsAt={e.ends_at}
                    startHasTime={e.start_has_time}
                    endHasTime={e.end_has_time}
                    href={`/sitio/eventos/${e.id}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </SitePage>
  );
}
