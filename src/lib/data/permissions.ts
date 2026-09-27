import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listMinistries } from "@/lib/data/ministries";
import { listClassOfferings } from "@/lib/data/courses";
import type { AppRole } from "@/types/database";

export interface PersonAccount {
  userId: string;
  email: string | null;
  emailConfirmedAt: string | null;
  accountCreatedAt: string;
  roles: AppRole[];
}

/**
 * Estado de la cuenta de autenticación de una persona (para "Cuenta y
 * permisos" → Cuenta). Nunca se infiere de `people.email` — solo
 * `auth.users.email` cuenta como email de acceso. `null` = sin cuenta
 * vinculada ("Sin cuenta"), no un error.
 */
export async function getAccountForPerson(personId: string): Promise<PersonAccount | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_account_for_person", {
    p_person_id: personId,
  });
  if (error) throw new Error(`No se pudo cargar la cuenta: ${error.message}`);

  const row = data?.[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    email: row.email,
    emailConfirmedAt: row.email_confirmed_at,
    accountCreatedAt: row.account_created_at,
    roles: row.roles ?? [],
  };
}

export interface PersonResponsibilities {
  ministriesLed: { id: string; name: string }[];
  classesTaught: { id: string; name: string }[];
}

/**
 * Ministerios que dirige y clases que imparte esta persona, para la
 * sección "Responsabilidades". Reutiliza las funciones de datos ya
 * existentes de ministerios/cursos (no hay backend nuevo aquí) — cada
 * una ya sabe filtrar "los que lidera/imparte esta persona".
 */
export async function getResponsibilitiesForPerson(
  personId: string,
): Promise<PersonResponsibilities> {
  const [ministries, classes] = await Promise.all([
    listMinistries({ ledByPersonId: personId, includeInactive: true }),
    listClassOfferings({ teacherPersonId: personId }),
  ]);

  return {
    ministriesLed: ministries.map((m) => ({ id: m.id, name: m.name })),
    classesTaught: classes.map((c) => ({ id: c.id, name: c.courseName })),
  };
}
