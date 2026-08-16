import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route
 * Handlers. Actúa como el usuario autenticado (sujeto a RLS); nunca usa
 * la service_role key. Debe crearse por request (no cachear/compartir).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Se llama desde un Server Component (no se pueden escribir
          // cookies). Es seguro ignorar: el middleware ya se encarga de
          // refrescar la sesión en cada request.
        }
      },
    },
  });
}
