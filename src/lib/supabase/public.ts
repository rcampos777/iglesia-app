import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Cliente anónimo SIN cookies para el sitio público: ve solo lo que RLS
 * permite a `anon` (contenido publicado). Al no leer cookies, las páginas
 * del sitio se pueden cachear (ISR) en vez de consultar en cada visita.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
