import { redirect } from "next/navigation";
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
import { RoleToggles } from "./role-toggles";

const ADMIN_ROLES = ["administrador"] as const;

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!hasAnyRole(user, [...ADMIN_ROLES])) redirect("/dashboard");

  const users = await listUsersWithRoles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administración de usuarios</h1>
        <p className="text-muted-foreground">
          Toca un rol para otorgarlo o quitarlo. Todo cambio queda auditado.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.userId}>
                <TableCell className="align-top font-medium">{u.email ?? u.userId}</TableCell>
                <TableCell>
                  <RoleToggles userId={u.userId} roles={u.roles} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
