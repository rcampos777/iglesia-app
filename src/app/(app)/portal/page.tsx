import { redirect } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  HandHeart,
  HeartHandshake,
  QrCode,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { activityTone, prayerTone } from "@/lib/status-tones";
import { getCurrentUser } from "@/lib/auth/session";
import { getMyEnrollments, getMyPerson, getMyPrayerRequests } from "@/lib/data/portal";
import { listMinistriesForPerson } from "@/lib/data/ministries";
import { listActivitiesForPerson } from "@/lib/data/activities";
import { activityStatusLabels, ministryMemberRoleLabels, prayerStatusLabels } from "@/lib/labels";
import { ContactForm } from "./contact-form";
import { PrayerRequestForm } from "./prayer-request-form";
import { MyQrCode } from "./my-qr-code";

function Section({
  id,
  icon: Icon,
  title,
  count,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5"
    >
      <h2 id={id} className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Icon className="text-muted-foreground size-[18px]" aria-hidden />
        {title}
        {count !== undefined && count > 0 ? (
          <span className="text-muted-foreground text-sm font-normal">({count})</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-[15px]">{children}</p>;
}

const rowClass =
  "flex items-center justify-between gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0";

export default async function PortalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.personId) redirect("/dashboard");

  const [person, enrollments, prayerRequests, ministries, activities] = await Promise.all([
    getMyPerson(user.personId),
    getMyEnrollments(user.personId),
    getMyPrayerRequests(user.userId),
    listMinistriesForPerson(user.personId),
    listActivitiesForPerson(user.personId),
  ]);

  const firstName = person?.preferred_name || person?.first_name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : "Mi portal"}
        description="Tu asistencia, tus actividades y tus cursos en un solo lugar."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="space-y-4 lg:col-span-2">
          <section
            aria-labelledby="checkin"
            className="bg-card ring-foreground/10 rounded-xl p-4 shadow-xs ring-1 sm:p-5"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-3">
                <h2 id="checkin" className="flex items-center gap-2 text-base font-semibold">
                  <QrCode className="text-muted-foreground size-[18px]" aria-hidden />
                  Asistencia al servicio
                </h2>
                <p className="text-muted-foreground text-[15px]">
                  Al llegar al culto, muestra este código a un ujier (o dile tu nombre) y él
                  confirma tu asistencia.
                </p>
              </div>
              <div className="border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
                <MyQrCode />
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Section
              id="actividades"
              icon={CalendarDays}
              title="Mis actividades"
              count={activities.length}
            >
              {activities.length === 0 ? (
                <Empty>No estás inscrito en ninguna actividad todavía.</Empty>
              ) : (
                <ul>
                  {activities.map((a) => (
                    <li key={a.id} className={rowClass}>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.activityName}</p>
                        <p className="text-muted-foreground text-sm">
                          {a.activityDate}
                          {a.activityLocation ? ` · ${a.activityLocation}` : ""}
                        </p>
                      </div>
                      <StatusBadge tone={a.attended ? "active" : activityTone[a.activityStatus]}>
                        {a.attended ? "Asististe" : activityStatusLabels[a.activityStatus]}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section id="cursos" icon={BookOpen} title="Mis cursos" count={enrollments.length}>
              {enrollments.length === 0 ? (
                <Empty>No estás matriculado en ningún curso todavía.</Empty>
              ) : (
                <ul>
                  {enrollments.map((e) => (
                    <li key={e.enrollmentId} className={rowClass}>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.classLabel}</p>
                        <p className="text-muted-foreground text-sm">{e.courseName}</p>
                      </div>
                      <StatusBadge tone="neutral">{e.attendancePercent}% asistencia</StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section
            id="ministerios"
            icon={HeartHandshake}
            title="Donde sirvo"
            count={ministries.length}
          >
            {ministries.length === 0 ? (
              <Empty>
                Todavía no sirves en ningún ministerio. Si te interesa servir, habla con un
                coordinador o con tu pastor.
              </Empty>
            ) : (
              <ul>
                {ministries.map((m) => (
                  <li key={m.id} className={rowClass}>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.ministryName}</p>
                      <p className="text-muted-foreground text-sm">Desde {m.joined_at}</p>
                    </div>
                    <StatusBadge tone="neutral">
                      {ministryMemberRoleLabels[m.role_in_ministry]}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section id="oracion" icon={HandHeart} title="Peticiones de oración">
            <PrayerRequestForm />
            {prayerRequests.length > 0 ? (
              <div className="mt-5 border-t pt-4">
                <h3 className="text-muted-foreground mb-2 text-sm font-medium">
                  Tus peticiones ({prayerRequests.length})
                </h3>
                <ul className="space-y-2">
                  {prayerRequests.map((p) => (
                    <li key={p.id} className="bg-muted/40 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge tone={prayerTone[p.status]}>
                          {prayerStatusLabels[p.status]}
                        </StatusBadge>
                        <time dateTime={p.created_at} className="text-muted-foreground text-sm">
                          {new Date(p.created_at).toLocaleDateString("es")}
                        </time>
                      </div>
                      <p className="mt-2 text-[15px] break-words">{p.content}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Section>

          {person ? (
            <details className="group bg-card ring-foreground/10 rounded-xl shadow-xs ring-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <UserRound className="text-muted-foreground size-[18px]" aria-hidden />
                  <span>
                    <span className="block text-base font-semibold">Mis datos de contacto</span>
                    <span className="text-muted-foreground block text-sm">
                      Teléfono, email y dirección
                    </span>
                  </span>
                </span>
                <ChevronDown
                  className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="border-t p-4 sm:p-5">
                <ContactForm person={person} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
