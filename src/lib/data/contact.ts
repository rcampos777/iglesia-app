import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SiteContactMessageRow } from "@/types/database";

/** Mensajes de la forma de contacto del sitio. RLS: can_read_contact_messages(). */
export async function listContactMessages(
  filter: "nuevos" | "todos",
): Promise<SiteContactMessageRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("site_contact_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "nuevos") q = q.eq("status", "nuevo");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}
