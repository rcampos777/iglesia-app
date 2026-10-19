/**
 * Verificación de 0052 (completar perfil tras Google/Apple) contra el
 * proyecto de DESARROLLO.
 *
 * Uso: npm run verify:oauth-profile
 *
 * La Admin API no puede crear una cuenta "de Google/Apple" real (inserta
 * siempre como provider=email y luego cambia app_metadata), así que aquí
 * se simula lo que importa: una cuenta que llega SIN first_name/last_name
 * en user_metadata, que es lo que mandan Google y Apple. Las comprobaciones
 * corren con la sesión normal del usuario (anon key + login), no con
 * service_role, para probar el RPC, el trigger y RLS reales.
 *
 * Crea y borra sus propias cuentas sintéticas (`verif-oauth-*`).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../src/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "development";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Faltan variables de Supabase en .env.local.");
  process.exit(1);
}
if (APP_ENV === "production") {
  console.error("NEXT_PUBLIC_APP_ENV=production: me niego a correr esto aquí.");
  process.exit(1);
}

const PASSWORD = "Verif-OAuth-2026!";
const RUN_ID = randomUUID().slice(0, 8);
const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
const cleanupUserIds: string[] = [];
const cleanupPersonIds: string[] = [];

function ok(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`, detail ?? "");
    failed++;
  }
}

async function makeUser(label: string, userMetadata: Record<string, unknown>) {
  const email = `verif-oauth-${label}-${RUN_ID}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
  cleanupUserIds.push(data.user.id);
  const { data: profile } = await admin
    .from("profiles")
    .select("person_id")
    .eq("id", data.user.id)
    .single();
  if (profile) cleanupPersonIds.push(profile.person_id);
  return { id: data.user.id, email, personId: profile?.person_id ?? "" };
}

async function signIn(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

async function state(userId: string, personId: string) {
  const [{ data: profile }, { data: person }] = await Promise.all([
    admin.from("profiles").select("profile_completed_at").eq("id", userId).single(),
    admin.from("people").select("first_name, last_name").eq("id", personId).single(),
  ]);
  return { completedAt: profile?.profile_completed_at ?? null, person };
}

async function main() {
  console.log("\n1. Cuenta tipo Google/Apple (sin first_name/last_name)");
  const g = await makeUser("google", { full_name: "Nombre Proveedor", name: "Nombre Proveedor" });
  let s = await state(g.id, g.personId);
  ok("queda con el perfil incompleto", s.completedAt === null, s);
  ok("la ficha usa el marcador, no el nombre del proveedor", s.person?.first_name === "Sin nombre");

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", g.id);
  ok(
    "solo recibe el rol miembro (sin permisos administrativos)",
    JSON.stringify((roles ?? []).map((r) => r.role)) === JSON.stringify(["miembro"]),
    roles,
  );

  const client = await signIn(g.email);

  console.log("\n2. No se puede saltar el formulario");
  const { error: patchErr } = await client
    .from("profiles")
    .update({ profile_completed_at: new Date().toISOString() })
    .eq("id", g.id);
  s = await state(g.id, g.personId);
  ok("PATCH directo de profile_completed_at rechazado", !!patchErr && s.completedAt === null, {
    patchErr,
    s,
  });

  const { error: blankErr } = await client.rpc("complete_my_profile", {
    p_first_name: "  ",
    p_last_name: "Apellido",
  });
  ok("nombre vacío rechazado", !!blankErr);

  console.log("\n3. Completar el perfil (abandonar y volver = sigue incompleto hasta aquí)");
  const { error: completeErr } = await client.rpc("complete_my_profile", {
    p_first_name: "  Ana ",
    p_last_name: "Verif",
  });
  s = await state(g.id, g.personId);
  ok("complete_my_profile funciona", !completeErr, completeErr);
  ok(
    "guarda nombre/apellido limpios en la ficha enlazada",
    s.person?.first_name === "Ana" && s.person?.last_name === "Verif",
    s.person,
  );
  ok("marca el perfil como completo", s.completedAt !== null);

  console.log("\n4. Accesos futuros no sobrescriben el nombre");
  const { error: againErr } = await client.rpc("complete_my_profile", {
    p_first_name: "Otro",
    p_last_name: "Nombre",
  });
  ok("segundo complete_my_profile rechazado (55000)", againErr?.code === "55000", againErr);
  // GoTrue refresca user_metadata con los datos del proveedor en cada acceso.
  await admin.auth.admin.updateUserById(g.id, {
    user_metadata: { full_name: "Nombre Cambiado", first_name: "Cambiado", last_name: "X" },
  });
  s = await state(g.id, g.personId);
  ok(
    "un cambio de metadatos del proveedor no toca la ficha",
    s.person?.first_name === "Ana" && s.person?.last_name === "Verif",
    s.person,
  );

  console.log("\n5. Aislamiento entre cuentas");
  const other = await makeUser("otra", {});
  const { data: touched } = await client
    .from("profiles")
    .update({ display_name: "hack" })
    .eq("id", other.id)
    .select("id");
  ok("no puede modificar el perfil de otra cuenta", (touched ?? []).length === 0, touched);
  const otherState = await state(other.id, other.personId);
  ok("la otra cuenta sigue incompleta", otherState.completedAt === null);

  console.log("\n6. Registro con email y contraseña (sin cambios)");
  const e = await makeUser("email", {
    first_name: "Luis",
    last_name: "Verif",
    full_name: "Luis Verif",
  });
  s = await state(e.id, e.personId);
  ok("queda completo de inmediato", s.completedAt !== null, s);
}

async function cleanup() {
  for (const id of cleanupUserIds) await admin.auth.admin.deleteUser(id);
  if (cleanupPersonIds.length) await admin.from("people").delete().in("id", cleanupPersonIds);
}

main()
  .catch((err) => {
    console.error(err);
    failed++;
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n${passed} OK, ${failed} fallos`);
    process.exit(failed ? 1 : 0);
  });
