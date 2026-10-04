import { SiteHome } from "@/components/sitio/site-home";
import {
  publicAlbums,
  publicAnnouncements,
  publicMinistries,
  publicSchedule,
  publicSettings,
  publicTeam,
  publicUpcomingEvents,
  publicVideos,
} from "@/lib/data/site";
import { upcomingServices, type Occurrence } from "@/lib/site/schedule";
import { FALLBACK_SETTINGS, safe } from "@/lib/site/load";

// Se regenera cada 5 minutos y, además, al guardar desde el editor
// (revalidatePath("/sitio", "layout")).
export const revalidate = 120;

export default async function SiteHomePage() {
  const [settings, schedule, events, announcements, albums, videos, ministries, team] =
    await Promise.all([
      safe("ajustes", publicSettings(), null),
      safe("horarios", publicSchedule(), []),
      safe("eventos", publicUpcomingEvents(8), []),
      safe("anuncios", publicAnnouncements(6), []),
      safe("álbumes", publicAlbums(6), []),
      safe("videos", publicVideos(6), []),
      safe("ministerios", publicMinistries(), []),
      safe("equipo", publicTeam(), []),
    ]);

  const upcoming: Occurrence[] = [
    ...events
      .filter((e) => e.starts_at)
      .map((e) => ({
        title: e.title,
        startsAt: e.starts_at!,
        endsAt: e.ends_at,
        startHasTime: e.start_has_time,
        endHasTime: e.end_has_time,
        href: `/sitio/eventos/${e.id}`,
        kind: "evento" as const,
      })),
    ...upcomingServices(schedule, 14),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <SiteHome
      data={{
        settings: settings ?? FALLBACK_SETTINGS,
        schedule,
        upcoming,
        announcements,
        albums,
        videos,
        ministries,
        team,
      }}
    />
  );
}
