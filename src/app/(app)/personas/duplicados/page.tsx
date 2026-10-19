import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CopyCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-brand/page-header";
import { StatusBadge } from "@/components/ui-brand/status-badge";
import { EmptyState, TableCard } from "@/components/ui-brand/table-card";
import { getCurrentUser, hasDirectoryAccess, isAdmin } from "@/lib/auth/session";
import { listDuplicatePairs } from "@/lib/data/person-registry";
import { matchLevelLabel } from "@/components/people/match-list";
import { DismissButton } from "./dismiss-button";

export default async function DuplicatesPage() {
  const user = await getCurrentUser();
  if (!hasDirectoryAccess(user)) redirect("/personas");
  const pairs = await listDuplicatePairs(200);
  const admin = isAdmin(user);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/personas">
          <ArrowLeft className="size-4" aria-hidden />
          Personas
        </Link>
      </Button>
      <PageHeader
        title="Posibles duplicados"
        description="Parejas que podrían ser la misma persona. Nada se une solo: revisa cada caso. Mismo nombre no basta (pueden ser personas distintas)."
        actions={
          admin ? (
            <Button asChild variant="outline">
              <Link href="/personas/vinculaciones">Solicitudes de vinculación</Link>
            </Button>
          ) : null
        }
      />
      <TableCard>
        {pairs.length === 0 ? (
          <EmptyState
            icon={CopyCheck}
            title="No hay posibles duplicados"
            description="Cuando dos registros compartan nombre, correo, teléfono o fecha de nacimiento aparecerán aquí."
          />
        ) : (
          <ul className="divide-y">
            {pairs.map((p) => (
              <li
                key={`${p.person_a}-${p.person_b}`}
                className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/personas/${p.person_a}`} className="font-medium hover:underline">
                      {p.name_a}
                    </Link>
                    <span className="text-muted-foreground">y</span>
                    <Link href={`/personas/${p.person_b}`} className="font-medium hover:underline">
                      {p.name_b}
                    </Link>
                    <StatusBadge tone={p.level === "confiable" ? "warning" : "neutral"}>
                      {matchLevelLabel[p.level]}
                    </StatusBadge>
                    {p.both_accounts ? (
                      <StatusBadge tone="error">Las dos tienen cuenta</StatusBadge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">{p.reasons.join(" · ")}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-start gap-2">
                  {admin ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/personas/duplicados/unificar?a=${p.person_a}&b=${p.person_b}`}>
                        Revisar y unificar
                      </Link>
                    </Button>
                  ) : null}
                  <DismissButton a={p.person_a} b={p.person_b} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </TableCard>
      {!admin ? (
        <p className="text-muted-foreground text-sm">
          Unificar lo hace un administrador. Puedes marcar las parejas que no son la misma persona.
        </p>
      ) : null}
    </div>
  );
}
