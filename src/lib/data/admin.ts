import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface UserWithRoles {
  userId: string;
  email: string | null;
  createdAt: string;
  roles: string[];
  personId: string | null;
  personName: string | null;
}

export interface UserListResult {
  users: UserWithRoles[];
  total: number;
}

/**
 * Lista de cuentas + roles + persona vinculada (si existe), con
 * búsqueda y paginación (mismo patrón que `listPeople`). Una cuenta sin
 * `person_id` (perfil sin persona asociada) se muestra tal cual — nunca
 * se vincula automáticamente aquí.
 */
export async function listUsersWithRoles(
  filters: { q?: string; limit?: number; offset?: number } = {},
): Promise<UserListResult> {
  const supabase = await createClient();
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;

  const { data, error } = await supabase.rpc("list_users_with_roles", {
    p_search: filters.q || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(`No se pudo cargar la lista de usuarios: ${error.message}`);

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;

  return {
    users: rows.map((u) => ({
      userId: u.user_id,
      email: u.email,
      createdAt: u.created_at,
      roles: u.roles,
      personId: u.person_id,
      personName:
        u.person_first_name || u.person_last_name
          ? `${u.person_first_name ?? ""} ${u.person_last_name ?? ""}`.trim()
          : null,
    })),
    total,
  };
}
