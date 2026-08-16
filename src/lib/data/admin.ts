import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface UserWithRoles {
  userId: string;
  email: string | null;
  createdAt: string;
  roles: string[];
}

export async function listUsersWithRoles(): Promise<UserWithRoles[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_users_with_roles");
  if (error) throw new Error(`No se pudo cargar la lista de usuarios: ${error.message}`);

  return (data ?? []).map((u) => ({
    userId: u.user_id,
    email: u.email,
    createdAt: u.created_at,
    roles: u.roles,
  }));
}
