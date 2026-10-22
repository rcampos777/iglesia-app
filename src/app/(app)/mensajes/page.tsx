import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { CONTACT_ROLES, getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { listContactMessages } from "@/lib/data/contact";
import { formatChurchDate, formatChurchTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { ContactStatusButton } from "./status-button";

export default async function ContactMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasAnyRole(user, CONTACT_ROLES)) redirect("/dashboard");

  const filter = (await searchParams).ver === "todos" ? "todos" : "nuevos";
  const messages = await listContactMessages(filter);

  const tab = (value: "nuevos" | "todos", label: string) => (
    <Link
      href={value === "nuevos" ? "/mensajes" : "/mensajes?ver=todos"}
      aria-current={filter === value ? "page" : undefined}
      className={cn(
        "block rounded-md px-3 py-1.5 text-sm font-medium",
        filter === value
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mensajes del sitio"
        description="Lo que escriben las personas en la forma de contacto de la página web."
      />
      <nav aria-label="Filtro de mensajes" className="bg-muted inline-flex gap-1 rounded-lg p-1">
        {tab("nuevos", "Sin atender")}
        {tab("todos", "Todos")}
      </nav>

      {messages.length === 0 ? (
        <p className="text-muted-foreground">
          {filter === "nuevos" ? "No hay mensajes sin atender." : "Todavía no hay mensajes."}
        </p>
      ) : (
        <ul className="space-y-4">
          {messages.map((m) => (
            <li
              key={m.id}
              className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 shadow-xs ring-1 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatChurchDate(m.created_at, true)}, {formatChurchTime(m.created_at)}
                  </p>
                </div>
                <StatusBadge tone={m.status === "nuevo" ? "warning" : "active"}>
                  {m.status === "nuevo" ? "Sin atender" : "Atendido"}
                </StatusBadge>
              </div>
              <p className="text-sm whitespace-pre-line">{m.message}</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {m.email ? (
                    <a
                      href={`mailto:${m.email}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Mail className="size-4" aria-hidden />
                      {m.email}
                    </a>
                  ) : null}
                  {m.phone ? (
                    <a
                      href={`tel:${m.phone.replace(/[^\d+]/g, "")}`}
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      <Phone className="size-4" aria-hidden />
                      {m.phone}
                    </a>
                  ) : null}
                </div>
                <ContactStatusButton id={m.id} status={m.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
