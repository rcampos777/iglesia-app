import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listUsersWithRoles } from "@/lib/data/admin";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import { roleLabels } from "@/lib/labels";

const ADMIN_ROLES = ["administrador"] as const;
const PAGE_SIZE = 25;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...ADMIN_ROLES])) redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { users, total } = await listUsersWithRoles({
    q: params.q,
    limit: PAGE_SIZE,
    offset,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(targetPage: number) {
    const usp = new URLSearchParams();
    if (params.q) usp.set("q", params.q);
    usp.set("page", String(targetPage));
    return `/admin?${usp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">
          Administración de usuarios
        </h1>
        <p className="text-muted-foreground">
          {total} cuentas. Abre &quot;Ver permisos&quot; para revisar o cambiar los accesos de una
          cuenta — los cambios se preparan y se aplican desde ahí.
        </p>
      </div>

      <form className="flex flex-col gap-3 sm:flex-row" method="get">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            name="q"
            placeholder="Buscar por email o nombre..."
            defaultValue={params.q}
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email de acceso</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                  No se encontraron cuentas.
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.userId}>
                <TableCell className="align-top font-medium">
                  {u.personName ?? (
                    <span className="text-muted-foreground italic">Sin perfil asociado</span>
                  )}
                </TableCell>
                <TableCell className="align-top">{u.email ?? "—"}</TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 && <span className="text-muted-foreground">—</span>}
                    {u.roles.map((role) => (
                      <Badge key={role} variant="outline">
                        {roleLabels[role as keyof typeof roleLabels] ?? role}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right align-top">
                  {u.personId ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/personas/${u.personId}?tab=cuenta-permisos`}>Ver permisos</Link>
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-sm">Sin perfil vinculado</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)}>Anterior</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Anterior
            </Button>
          )}
          <p className="text-muted-foreground text-sm">
            Página {page} de {totalPages}
          </p>
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)}>Siguiente</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Siguiente
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
