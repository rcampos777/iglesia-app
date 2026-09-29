"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { savePersonRolesAction } from "@/app/(app)/personas/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { roleDescriptions, roleLabels } from "@/lib/labels";
import type { AppRole } from "@/types/database";
import type { PersonAccount, PersonResponsibilities } from "@/lib/data/permissions";

const ROLE_GROUPS: { label: string; description?: string; roles: AppRole[] }[] = [
  {
    label: "Roles",
    roles: [
      "miembro",
      "maestro",
      "seguimiento",
      "intercesor",
      "coordinador_ministerio",
      "pastor",
      "administrador",
    ],
  },
  {
    label: "Asistencia a cultos",
    description:
      "Ser miembro de un ministerio o tener el título de servidor no concede ninguno de estos accesos: se otorgan aquí, uno por uno.",
    roles: ["ujier", "gestion_cultos", "control_checkin", "correccion_asistencia"],
  },
];

function sortRoles(roles: AppRole[]): AppRole[] {
  return [...new Set(roles)].sort();
}

function rolesEqual(a: AppRole[], b: AppRole[]): boolean {
  const sa = sortRoles(a);
  const sb = sortRoles(b);
  return sa.length === sb.length && sa.every((r, i) => r === sb[i]);
}

export function AccountPermissionsTab({
  personId,
  account,
  responsibilities,
}: {
  personId: string;
  account: PersonAccount | null;
  responsibilities: PersonResponsibilities;
}) {
  return (
    <div className="space-y-6">
      <AccountSection account={account} />
      <ResponsibilitiesSection responsibilities={responsibilities} />
      {account && <PermissionsSection personId={personId} account={account} />}
      {!account && (
        <Card>
          <CardHeader>
            <CardTitle>Permisos de la aplicación</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Esta persona no tiene una cuenta de acceso, así que no tiene permisos asignados. Los
              permisos se gestionan aquí una vez que exista una cuenta vinculada.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AccountSection({ account }: { account: PersonAccount | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuenta</CardTitle>
      </CardHeader>
      <CardContent>
        {!account ? (
          <p className="text-muted-foreground text-sm">
            <Badge variant="outline" className="mr-2">
              Sin cuenta
            </Badge>
            Esta persona no tiene una cuenta de acceso a la aplicación.
          </p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Email de acceso</dt>
              <dd className="font-medium">{account.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Estado del email</dt>
              <dd>
                <Badge variant={account.emailConfirmedAt ? "default" : "outline"}>
                  {account.emailConfirmedAt ? "Verificado" : "Sin verificar"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cuenta creada</dt>
              <dd>{new Date(account.accountCreatedAt).toLocaleDateString("es")}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function ResponsibilitiesSection({
  responsibilities,
}: {
  responsibilities: PersonResponsibilities;
}) {
  const { ministriesLed, classesTaught } = responsibilities;
  const hasAny = ministriesLed.length > 0 || classesTaught.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Responsabilidades</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasAny && (
          <p className="text-muted-foreground text-sm">
            No dirige ministerios ni imparte clases actualmente.
          </p>
        )}
        {ministriesLed.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-sm font-medium">Ministerios que dirige</p>
            <ul className="space-y-1">
              {ministriesLed.map((m) => (
                <li key={m.id}>
                  <Link href={`/ministerios/${m.id}`} className="text-sm hover:underline">
                    {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {classesTaught.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-sm font-medium">Clases que imparte</p>
            <ul className="space-y-1">
              {classesTaught.map((c) => (
                <li key={c.id}>
                  <Link href={`/cursos/clases/${c.id}`} className="text-sm hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PermissionsSection({ personId, account }: { personId: string; account: PersonAccount }) {
  const originalRoles = useMemo(() => sortRoles(account.roles), [account.roles]);
  const [staged, setStaged] = useState<AppRole[]>(originalRoles);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { type: "success" } | { type: "error"; message: string } | null
  >(null);

  const stagedSorted = useMemo(() => sortRoles(staged), [staged]);
  const hasChanges = !rolesEqual(stagedSorted, originalRoles);
  const toAdd = stagedSorted.filter((r) => !originalRoles.includes(r));
  const toRemove = originalRoles.filter((r) => !stagedSorted.includes(r));

  function toggleRole(role: AppRole) {
    setFeedback(null);
    setStaged((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function cancel() {
    setStaged(originalRoles);
    setFeedback(null);
  }

  function save() {
    startTransition(async () => {
      const result = await savePersonRolesAction(personId, originalRoles, stagedSorted);
      if (result.ok) {
        setStaged(sortRoles(result.data.roles));
        setFeedback({ type: "success" });
      } else {
        setFeedback({ type: "error", message: result.error });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permisos de la aplicación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback?.type === "error" && (
          <Alert variant="destructive">
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        )}
        {feedback?.type === "success" && (
          <Alert>
            <AlertDescription>Los cambios se guardaron correctamente.</AlertDescription>
          </Alert>
        )}

        {account.roles.some((r) => r === "apostol" || r === "finanzas") ? (
          <div className="bg-muted/40 rounded-md border p-3 text-sm">
            <p className="font-medium">
              Acceso financiero:{" "}
              {account.roles
                .filter((r) => r === "apostol" || r === "finanzas")
                .map((r) => roleLabels[r])
                .join(", ")}
            </p>
            <p className="text-muted-foreground text-xs">
              Solo un SuperAdmin lo concede o revoca (Finanzas → Acceso). No se cambia desde aquí.
              {account.roles.includes("apostol") ? " SuperAdmin tiene todos los permisos." : ""}
            </p>
          </div>
        ) : null}
        {ROLE_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">{group.label}</h3>
              {group.description ? (
                <p className="text-muted-foreground text-xs">{group.description}</p>
              ) : null}
            </div>
            <ul className="divide-y rounded-md border">
              {group.roles.map((role) => {
                const active = staged.includes(role);
                return (
                  <li key={role} className="flex items-center justify-between gap-4 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{roleLabels[role]}</p>
                      <p className="text-muted-foreground text-xs">{roleDescriptions[role]}</p>
                    </div>
                    <Switch
                      checked={active}
                      disabled={isPending}
                      onCheckedChange={() => toggleRole(role)}
                      aria-label={`${active ? "Quitar" : "Otorgar"} ${roleLabels[role]}`}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {hasChanges && (
          <Alert>
            <AlertDescription>
              <p className="font-medium">Cambios preparados (aún no aplicados):</p>
              {toAdd.length > 0 && (
                <p>Se otorgará: {toAdd.map((r) => roleLabels[r]).join(", ")}.</p>
              )}
              {toRemove.length > 0 && (
                <p>Se quitará: {toRemove.map((r) => roleLabels[r]).join(", ")}.</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button type="button" onClick={save} disabled={!hasChanges || isPending}>
            {isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={cancel}
            disabled={!hasChanges || isPending}
          >
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
