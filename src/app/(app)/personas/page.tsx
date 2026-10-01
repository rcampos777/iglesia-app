import Link from "next/link";
import { ChevronLeft, ChevronRight, Mail, Phone, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { EmptyState, TableCard } from "@/components/ui-brand/table-card";
import { listPeople, listRegistrationActivities } from "@/lib/data/people";
import { membershipStatusLabels, personSourceLabels } from "@/lib/labels";
import { membershipTone } from "@/lib/status-tones";
import {
  membershipStatusValues,
  parsePersonSourceFilter,
  personSourceValues,
} from "@/lib/validations/people";
import { redirect } from "next/navigation";
import { getCurrentUser, hasAnyRole, isStaff } from "@/lib/auth/session";
import type { MembershipStatus, PersonRow } from "@/types/database";

const WRITE_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;
const PAGE_SIZE = 25;

function originLabel(person: PersonRow, activityNames: Record<string, string>) {
  const activity = person.source_activity_id ? activityNames[person.source_activity_id] : null;
  return activity ? `Inscripción: ${activity}` : personSourceLabels[person.source];
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; origen?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status as MembershipStatus | "todos" | undefined) ?? "todos";
  const origin = parsePersonSourceFilter(params.origen);
  const originValue = origin.activityId
    ? `actividad:${origin.activityId}`
    : (origin.source ?? "todos");
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const user = await getCurrentUser();
  // El directorio es para staff. Un miembro ve su propia información en
  // /portal; RLS además ya limitaba los datos, pero la página no debe
  // siquiera cargar para él.
  if (!isStaff(user)) redirect("/portal");

  const [{ people, total, activityNames }, registrationActivities] = await Promise.all([
    listPeople({
      q: params.q,
      status,
      source: origin.source,
      sourceActivityId: origin.activityId,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listRegistrationActivities(),
  ]);

  const canWrite = hasAnyRole(user, [...WRITE_ROLES]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const hasFilters = Boolean(params.q) || status !== "todos" || originValue !== "todos";

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (status !== "todos") qs.set("status", status);
    if (originValue !== "todos") qs.set("origen", originValue);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/personas?${s}` : "/personas";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personas"
        description={`${total} ${total === 1 ? "persona" : "personas"}${hasFilters ? " con estos filtros" : " registradas"}.`}
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/personas/nueva">
                <Plus className="size-4" aria-hidden />
                Nueva persona
              </Link>
            </Button>
          ) : null
        }
      />

      <form
        className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-3 shadow-xs ring-1 sm:flex-row sm:flex-wrap sm:items-end"
        method="get"
        role="search"
      >
        {/* El buscador ocupa su propia fila hasta xl; ahí cabe todo en una. */}
        <div className="flex-1 basis-full space-y-1.5 xl:min-w-48 xl:basis-0">
          <Label htmlFor="q" className="text-muted-foreground text-sm">
            Buscar
          </Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="q"
              name="q"
              placeholder="Nombre, email o teléfono"
              defaultValue={params.q}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status" className="text-muted-foreground text-sm">
            Estatus
          </Label>
          <Select name="status" defaultValue={status}>
            <SelectTrigger id="status" className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estatus</SelectItem>
              {membershipStatusValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {membershipStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="origen" className="text-muted-foreground text-sm">
            Origen
          </Label>
          <Select name="origen" defaultValue={originValue}>
            <SelectTrigger id="origen" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los orígenes</SelectItem>
              {personSourceValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {personSourceLabels[s]}
                  {s === "inscripcion_actividad" ? " (todas)" : ""}
                </SelectItem>
              ))}
              {registrationActivities.map((a) => (
                <SelectItem key={a.id} value={`actividad:${a.id}`}>
                  Inscripción: {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1 sm:flex-none">
            Filtrar
          </Button>
          {hasFilters ? (
            <Button asChild variant="ghost">
              <Link href="/personas">Limpiar</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <TableCard>
        {people.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? "No hay personas con estos filtros" : "Todavía no hay personas"}
            description={
              hasFilters
                ? "Prueba con otro nombre o quita los filtros de estatus u origen."
                : "Registra la primera persona o importa un archivo."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Contacto</TableHead>
                <TableHead className="hidden sm:table-cell">Estatus</TableHead>
                <TableHead className="hidden pr-4 lg:table-cell">Origen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.id} className="relative">
                  <TableCell className="py-3 pl-4 whitespace-normal">
                    <Link
                      href={`/personas/${person.id}`}
                      className="text-foreground font-medium after:absolute after:inset-0 hover:underline"
                    >
                      {person.first_name} {person.last_name}
                    </Link>
                    {/* En móvil el contacto y el estatus van bajo el nombre. */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
                      {person.email || person.phone ? (
                        <span className="text-muted-foreground min-w-0 truncate text-sm">
                          {person.email || person.phone}
                        </span>
                      ) : null}
                      <StatusBadge
                        tone={membershipTone[person.membership_status]}
                        className="sm:hidden"
                      >
                        {membershipStatusLabels[person.membership_status]}
                      </StatusBadge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs lg:hidden">
                      <span className="sr-only">Origen: </span>
                      {originLabel(person, activityNames)}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden py-3 md:table-cell">
                    <div className="flex flex-col gap-0.5 text-sm">
                      {person.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail className="size-3.5 shrink-0" aria-hidden />
                          <span className="sr-only">Email:</span>
                          {person.email}
                        </span>
                      ) : null}
                      {person.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="size-3.5 shrink-0" aria-hidden />
                          <span className="sr-only">Teléfono:</span>
                          {person.phone}
                        </span>
                      ) : null}
                      {!person.email && !person.phone ? "—" : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-3 sm:table-cell">
                    <StatusBadge tone={membershipTone[person.membership_status]}>
                      {membershipStatusLabels[person.membership_status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden py-3 pr-4 text-sm whitespace-normal lg:table-cell">
                    {originLabel(person, activityNames)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      {total > 0 ? (
        <nav
          aria-label="Paginación"
          className="flex flex-col items-center justify-between gap-3 sm:flex-row"
        >
          <p className="text-muted-foreground text-sm">
            Mostrando {from}–{to} de {total}
          </p>
          {pageCount > 1 ? (
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page - 1)}>
                    <ChevronLeft className="size-4" aria-hidden />
                    Anterior
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft className="size-4" aria-hidden />
                  Anterior
                </Button>
              )}
              <span className="text-muted-foreground px-1 text-sm tabular-nums">
                Página {page} de {pageCount}
              </span>
              {page < pageCount ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(page + 1)}>
                    Siguiente
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Siguiente
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
