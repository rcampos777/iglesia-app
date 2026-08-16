import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { listPeople } from "@/lib/data/people";
import { membershipStatusLabels } from "@/lib/labels";
import { membershipStatusValues } from "@/lib/validations/people";
import { getCurrentUser, hasAnyRole } from "@/lib/auth/session";
import type { MembershipStatus } from "@/types/database";

const WRITE_ROLES = ["administrador", "pastor", "coordinador_ministerio", "seguimiento"] as const;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status as MembershipStatus | "todos" | undefined) ?? "todos";

  const [user, { people, total }] = await Promise.all([
    getCurrentUser(),
    listPeople({ q: params.q, status }),
  ]);

  const canWrite = hasAnyRole(user, [...WRITE_ROLES]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Personas</h1>
          <p className="text-muted-foreground">{total} personas registradas.</p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/personas/nueva">
              <Plus className="mr-2 size-4" />
              Nueva persona
            </Link>
          </Button>
        )}
      </div>

      <form className="flex flex-col gap-3 sm:flex-row" method="get">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            name="q"
            placeholder="Buscar por nombre, email o teléfono..."
            defaultValue={params.q}
            className="pl-8"
          />
        </div>
        <Select name="status" defaultValue={status}>
          <SelectTrigger className="w-full sm:w-56">
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
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden sm:table-cell">Contacto</TableHead>
              <TableHead>Estatus</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground py-8 text-center">
                  No se encontraron personas.
                </TableCell>
              </TableRow>
            )}
            {people.map((person) => (
              <TableRow key={person.id}>
                <TableCell>
                  <Link href={`/personas/${person.id}`} className="font-medium hover:underline">
                    {person.first_name} {person.last_name}
                  </Link>
                  <p className="text-muted-foreground text-sm sm:hidden">
                    {person.email || person.phone || ""}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {person.email || person.phone || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {membershipStatusLabels[person.membership_status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
