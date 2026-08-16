import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

/**
 * Cliente con service_role key: se salta RLS por completo.
 *
 * USAR SOLO cuando la operación deliberadamente necesita ignorar RLS
 * (ej. otorgar el primer rol de administrador, jobs programados,
 * verificación de tokens de check-in antes de identificar al usuario).
 * Cada uso debe justificarse con un comentario en el call site.
 *
 * `import "server-only"` evita que este módulo se incluya por error en
 * un bundle de cliente.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
