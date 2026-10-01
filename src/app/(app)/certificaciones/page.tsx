import Link from "next/link";
import { FileText, Plus, Search, ShieldCheck, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { EmptyState, TableCard } from "@/components/ui-brand/table-card";
import { requireFinancePage } from "@/lib/finance/guard";
import { listCertifications, listCertificationTypes } from "@/lib/data/certifications";
import {
  certificationStatus,
  certificationStatusLabels,
  certificationStatusTone,
  certificationStatusValues,
  EXPIRING_SOON_DAYS,
  type CertificationStatus,
} from "@/lib/certifications";
import { churchDateKey, formatDateKeyInline } from "@/lib/datetime";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; tipo?: string }>;
}) {
  await requireFinancePage();
  const sp = await searchParams;
  const estado = (certificationStatusValues as readonly string[]).includes(sp.estado ?? "")
    ? (sp.estado as CertificationStatus)
    : "todos";
  const tipo = sp.tipo && UUID_RE.test(sp.tipo) ? sp.tipo : "todos";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);

  const [all, types] = await Promise.all([listCertifications(), listCertificationTypes()]);
  const today = churchDateKey();
  const withStatus = all.map((c) => ({ ...c, status: certificationStatus(c.expires_on, today) }));
  const counts = Object.fromEntries(
    certificationStatusValues.map((s) => [s, withStatus.filter((c) => c.status === s).length]),
  ) as Record<CertificationStatus, number>;
  const rows = withStatus.filter(
    (c) =>
      (estado === "todos" || c.status === estado) &&
      (tipo === "todos" || c.type_id === tipo) &&
      (!q || c.person_name.toLowerCase().includes(q)),
  );
  const hasFilters = Boolean(q) || estado !== "todos" || tipo !== "todos";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificaciones"
        description="Antecedentes penales, Ley 300 y demás documentos de quienes sirven. Solo SuperAdmin y Finanzas."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/certificaciones/tipos">
                <Tags className="size-4" aria-hidden />
                Tipos
              </Link>
            </Button>
            <Button asChild>
              <Link href="/certificaciones/nueva">
                <Plus className="size-4" aria-hidden />
                Nueva certificación
              </Link>
            </Button>
          </div>
        }
      />

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen">
        {certificationStatusValues.map((s) => (
          <li key={s}>
            <Link
              href={estado === s ? "/certificaciones" : `/certificaciones?estado=${s}`}
              aria-current={estado === s ? "true" : undefined}
              className="bg-card ring-foreground/10 hover:ring-foreground/25 aria-[current]:ring-primary block rounded-xl p-3 shadow-xs ring-1 transition"
            >
              <span className="text-2xl font-semibold tabular-nums">{counts[s]}</span>
              <span className="text-muted-foreground block text-sm">
                {certificationStatusLabels[s]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground -mt-3 text-sm">
        &quot;Vence pronto&quot; = vence en los próximos {EXPIRING_SOON_DAYS} días.
      </p>

      <form
        className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-3 shadow-xs ring-1 sm:flex-row sm:flex-wrap sm:items-end"
        method="get"
        role="search"
      >
        <div className="flex-1 basis-full space-y-1.5 xl:min-w-48 xl:basis-0">
          <Label htmlFor="q" className="text-muted-foreground text-sm">
            Buscar
          </Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input id="q" name="q" placeholder="Nombre" defaultValue={sp.q} className="pl-8" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="estado" className="text-muted-foreground text-sm">
            Estado
          </Label>
          <Select name="estado" defaultValue={estado}>
            <SelectTrigger id="estado" className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {certificationStatusValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {certificationStatusLabels[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tipo" className="text-muted-foreground text-sm">
            Tipo
          </Label>
          <Select name="tipo" defaultValue={tipo}>
            <SelectTrigger id="tipo" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
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
              <Link href="/certificaciones">Limpiar</Link>
            </Button>
          ) : null}
        </div>
      </form>

      <TableCard>
        {rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={
              hasFilters
                ? "No hay certificaciones con estos filtros"
                : "Todavía no hay certificaciones"
            }
            description={
              hasFilters
                ? "Prueba con otro nombre o quita los filtros."
                : "Registra la primera con el botón «Nueva certificación»."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Persona</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead className="hidden pr-4 sm:table-cell">Documento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="relative">
                  <TableCell className="py-3 pl-4 whitespace-normal">
                    <Link
                      href={`/certificaciones/${c.id}`}
                      className="text-foreground font-medium after:absolute after:inset-0 hover:underline"
                    >
                      {c.person_name}
                    </Link>
                    <span className="text-muted-foreground mt-0.5 block text-sm md:hidden">
                      {c.type_name}
                    </span>
                  </TableCell>
                  <TableCell className="hidden py-3 whitespace-normal md:table-cell">
                    {c.type_name}
                  </TableCell>
                  <TableCell className="py-3 whitespace-normal">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge tone={certificationStatusTone[c.status]}>
                        {certificationStatusLabels[c.status]}
                      </StatusBadge>
                      {c.expires_on ? (
                        <span className="text-muted-foreground text-sm">
                          {formatDateKeyInline(c.expires_on)}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden py-3 pr-4 text-sm sm:table-cell">
                    {c.has_file ? (
                      <span className="flex items-center gap-1.5">
                        <FileText className="size-4" aria-hidden />
                        Adjunto
                      </span>
                    ) : (
                      "Falta"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
