/**
 * Pruebas de regresión para la FASE 1 (identidad, rol pastor, escalada
 * de oración) — migraciones 0027, 0028 y 0029.
 *
 * NO se pudo ejecutar en el entorno del agente que escribió este
 * script: ni el puente al equipo del usuario ni el contenedor en la
 * nube tenían salida de red hacia *.supabase.co en esta sesión (ver
 * docs/progress.md, entrada de esta fase). Está escrito y listo para
 * correr desde cualquier lugar con salida de red normal — la propia
 * terminal del usuario, por ejemplo.
 *
 * Requisitos antes de correr:
 *   1. Migraciones 0027/0028/0029 aplicadas contra el proyecto de
 *      DESARROLLO (`supabase db push`, ver docs/deployment.md).
 *   2. .env.local completo (usa el mismo proyecto que `npm run seed`).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/verify-security-phase1.ts
 *
 * Es autocontenido: crea sus propias personas/cuentas sintéticas con
 * prefijo `verif-phase1-` y las borra al final (o al fallar), para no
 * depender de datos sembrados por scripts/seed.ts ni ensuciar la base.
 * Usa la service_role key para el montaje/limpieza (igual que seed.ts);
 * las comprobaciones en sí corren con las sesiones/clientes normales
 * (anon key + login) para probar RLS real, no el atajo de service_role.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
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

const PASSWORD = "Verif-Phase1-2026!";
const RUN_ID = randomUUID().slice(0, 8);
const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;
const cleanupUserIds: string[] = [];
const cleanupPersonIds: string[] = [];
const cleanupMinistryIds: string[] = [];

function ok(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`, detail ?? "");
    failed++;
  }
}

async function makePerson(firstName: string): Promise<string> {
  const { data, error } = await admin
    .from("people")
    .insert({
      first_name: `${firstName}-${RUN_ID}`,
      last_name: "verif-phase1",
      membership_status: "asistente_habitual",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear persona: ${error?.message}`);
  cleanupPersonIds.push(data.id);
  return data.id;
}

/** Crea un usuario + persona vinculada correctamente (vía app_metadata) y le asigna roles. */
async function makeStaffUser(label: string, roles: Database["public"]["Enums"]["app_role"][]) {
  const personId = await makePerson(label);
  const email = `verif-phase1-${label}-${RUN_ID}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { person_id: personId },
  });
  if (error || !created?.user)
    throw new Error(`No se pudo crear usuario ${label}: ${error?.message}`);
  cleanupUserIds.push(created.user.id);

  for (const role of roles) {
    if (role === "miembro") continue; // ya lo tiene por default
    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: created.user.id, role });
    if (roleError)
      throw new Error(`No se pudo asignar rol ${role} a ${label}: ${roleError.message}`);
  }

  return { userId: created.user.id, personId, email };
}

async function signIn(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`No se pudo iniciar sesión como ${email}: ${error.message}`);
  return client;
}

async function testIdentityImpersonation() {
  console.log("\n[1.A] Suplantación por metadata pública del signup");

  const victim = await makePerson("victima");

  const attackerClient = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const attackerEmail = `verif-phase1-atacante-${RUN_ID}@example.com`;

  // Llamada al endpoint PÚBLICO de registro (lo que la app también usa),
  // pero intentando colar person_id en user_metadata — el único campo
  // que un cliente con la anon key puede escribir.
  const { data: signUpData, error: signUpError } = await attackerClient.auth.signUp({
    email: attackerEmail,
    password: PASSWORD,
    options: { data: { person_id: victim, first_name: "Atacante", last_name: RUN_ID } },
  });

  ok("El signup público no fue rechazado (comportamiento normal)", !signUpError, signUpError);
  if (signUpData?.user) cleanupUserIds.push(signUpData.user.id);

  const { data: attackerProfile } = await admin
    .from("profiles")
    .select("person_id")
    .eq("id", signUpData?.user?.id ?? "")
    .maybeSingle();

  ok(
    "La cuenta del atacante NO quedó vinculada a la víctima",
    attackerProfile?.person_id !== victim,
    attackerProfile,
  );
  ok(
    "La cuenta del atacante quedó vinculada a una persona NUEVA (propia)",
    !!attackerProfile?.person_id,
  );

  const { data: victimStillOrphan } = await admin
    .from("profiles")
    .select("id")
    .eq("person_id", victim)
    .maybeSingle();
  ok("La víctima sigue sin cuenta vinculada", !victimStillOrphan, victimStillOrphan);
}

async function testProfileRelinkBlocked() {
  console.log("\n[1.A] Auto-reasignación de profiles.person_id vía API directa");

  const userB = await makeStaffUser("usuarioB", []);
  const orphanPerson = await makePerson("huerfana");

  const clientB = await signIn(userB.email);

  const { error: updateError } = await clientB
    .from("profiles")
    .update({ person_id: orphanPerson })
    .eq("id", userB.userId);

  ok("El intento de re-vincular la propia cuenta fue rechazado", !!updateError, updateError);

  const { data: stillLinked } = await admin
    .from("profiles")
    .select("person_id")
    .eq("id", userB.userId)
    .maybeSingle();
  ok("profiles.person_id de B no cambió", stillLinked?.person_id === userB.personId, stillLinked);
}

async function testInvitationHappyPath() {
  console.log("\n[1.A] Invitación verificable — camino legítimo");

  const staff = await makeStaffUser("staff-invita", ["administrador"]);
  const invitee = await makePerson("invitada");
  const inviteeEmail = `verif-phase1-invitada-${RUN_ID}@example.com`;

  const staffClient = await signIn(staff.email);
  const { data: token, error: rpcError } = await staffClient.rpc("create_portal_invitation", {
    p_person_id: invitee,
    p_email: inviteeEmail,
  });
  ok("create_portal_invitation() devolvió un token", !rpcError && !!token, rpcError);

  if (!token) return;

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: invitationRow } = await admin
    .from("portal_invitations")
    .select("id, person_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  ok("La invitación quedó guardada con el hash correcto", invitationRow?.person_id === invitee);

  // Simula la aceptación (lo que hace activar-portal/actions.ts).
  const { data: acceptedUser, error: acceptError } = await admin.auth.admin.createUser({
    email: inviteeEmail,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { person_id: invitee },
  });
  ok("La cuenta de la invitada se creó", !acceptError && !!acceptedUser?.user, acceptError);
  if (acceptedUser?.user) cleanupUserIds.push(acceptedUser.user.id);

  const { data: acceptedProfile } = await admin
    .from("profiles")
    .select("person_id")
    .eq("id", acceptedUser?.user?.id ?? "")
    .maybeSingle();
  ok(
    "La cuenta activada quedó vinculada a la persona invitada (sin crear otro expediente)",
    acceptedProfile?.person_id === invitee,
    acceptedProfile,
  );
}

async function testPastorScope() {
  console.log("\n[1.B] Ámbito del rol pastor");

  const pastor = await makeStaffUser("pastor", ["pastor"]);
  const otherPastor = await makeStaffUser("pastor-otro", ["pastor"]);

  const pastorClient = await signIn(pastor.email);

  // --- Ministerios: solo el que lidera ---
  const { data: myMinistry } = await admin
    .from("ministries")
    .insert({ name: `Ministerio propio ${RUN_ID}`, leader_person_id: pastor.personId })
    .select("id")
    .single();
  const { data: otherMinistry } = await admin
    .from("ministries")
    .insert({ name: `Ministerio ajeno ${RUN_ID}`, leader_person_id: otherPastor.personId })
    .select("id")
    .single();
  if (myMinistry) cleanupMinistryIds.push(myMinistry.id);
  if (otherMinistry) cleanupMinistryIds.push(otherMinistry.id);

  const { error: editOwnError } = await pastorClient
    .from("ministries")
    .update({ location: "Salón A" })
    .eq("id", myMinistry!.id);
  ok("El pastor puede editar el ministerio que SÍ lidera", !editOwnError, editOwnError);

  const { error: editOtherError, data: editOtherData } = await pastorClient
    .from("ministries")
    .update({ location: "Salón B" })
    .eq("id", otherMinistry!.id)
    .select();
  ok(
    "El pastor NO puede editar un ministerio que no lidera",
    !!editOtherError || (editOtherData ?? []).length === 0,
    { editOtherError, editOtherData },
  );

  // --- Cursos: solo la clase que imparte ---
  const { data: category } = await admin
    .from("course_categories")
    .insert({ code: `verif-${RUN_ID}`, name: `Categoría ${RUN_ID}` })
    .select("id")
    .single();
  const { data: course } = await admin
    .from("courses")
    .insert({ category_id: category!.id, name: `Curso ${RUN_ID}` })
    .select("id")
    .single();
  const { data: myClass } = await admin
    .from("class_offerings")
    .insert({ course_id: course!.id, label: "Mi clase", teacher_person_id: pastor.personId })
    .select("id")
    .single();
  const { data: otherClass } = await admin
    .from("class_offerings")
    .insert({ course_id: course!.id, label: "Otra clase", teacher_person_id: otherPastor.personId })
    .select("id")
    .single();

  const { error: editMyClassError } = await pastorClient
    .from("class_offerings")
    .update({ location: "Aula 1" })
    .eq("id", myClass!.id);
  ok("El pastor puede editar SU propia clase", !editMyClassError, editMyClassError);

  const { error: editOtherClassError, data: editOtherClassData } = await pastorClient
    .from("class_offerings")
    .update({ location: "Aula 2" })
    .eq("id", otherClass!.id)
    .select();
  ok(
    "El pastor NO puede editar la clase de otro maestro/pastor",
    !!editOtherClassError || (editOtherClassData ?? []).length === 0,
    { editOtherClassError, editOtherClassData },
  );

  // limpieza específica de este bloque (no está en las listas genéricas)
  await admin.from("class_offerings").delete().in("id", [myClass!.id, otherClass!.id]);
  await admin.from("courses").delete().eq("id", course!.id);
  await admin.from("course_categories").delete().eq("id", category!.id);
}

async function testPrayerMembershipEscalation() {
  console.log("\n[1.C] Escalada de acceso a oración vía membresía");

  const admin_ = await makeStaffUser("admin-oracion", ["administrador"]);
  const coordinador = await makeStaffUser("coordinador-oracion", ["coordinador_ministerio"]);
  const target = await makePerson("aspirante-colider");

  const { data: prayerMinistry } = await admin
    .from("ministries")
    .insert({ name: `Intercesión verif ${RUN_ID}`, grants_prayer_access: false })
    .select("id")
    .single();
  cleanupMinistryIds.push(prayerMinistry!.id);

  // El admin designa el ministerio como el de intercesión (único camino legítimo).
  const adminClient = await signIn(admin_.email);
  const { error: designateError } = await adminClient.rpc("set_prayer_ministry", {
    p_ministry_id: prayerMinistry!.id,
    p_enabled: true,
  });
  ok(
    "El administrador SÍ puede designar el ministerio de intercesión",
    !designateError,
    designateError,
  );

  // El coordinador intenta agregarse a sí mismo como colíder: debe fallar.
  const coordinadorClient = await signIn(coordinador.email);
  const { error: selfGrantError, data: selfGrantData } = await coordinadorClient
    .from("ministry_memberships")
    .insert({
      ministry_id: prayerMinistry!.id,
      person_id: coordinador.personId,
      role_in_ministry: "colider",
    })
    .select();
  ok(
    "El coordinador NO puede auto-concederse colíder de intercesión",
    !!selfGrantError || (selfGrantData ?? []).length === 0,
    { selfGrantError, selfGrantData },
  );

  // Tampoco a un tercero.
  const { error: thirdPartyError, data: thirdPartyData } = await coordinadorClient
    .from("ministry_memberships")
    .insert({
      ministry_id: prayerMinistry!.id,
      person_id: target,
      role_in_ministry: "colider",
    })
    .select();
  ok(
    "El coordinador NO puede conceder colíder de intercesión a un tercero",
    !!thirdPartyError || (thirdPartyData ?? []).length === 0,
    { thirdPartyError, thirdPartyData },
  );

  // El coordinador SÍ puede seguir agregando 'miembro' normal (no escala nada).
  const { error: normalMemberError } = await coordinadorClient
    .from("ministry_memberships")
    .insert({ ministry_id: prayerMinistry!.id, person_id: target, role_in_ministry: "miembro" });
  ok(
    "El coordinador SÍ puede agregar un miembro normal (no lider/colider)",
    !normalMemberError,
    normalMemberError,
  );

  // Pero el admin sí puede otorgar legítimamente el colíder.
  const { error: adminGrantError } = await adminClient
    .from("ministry_memberships")
    .update({ role_in_ministry: "colider" })
    .eq("ministry_id", prayerMinistry!.id)
    .eq("person_id", target);
  ok(
    "El administrador SÍ puede otorgar colíder de intercesión legítimamente",
    !adminGrantError,
    adminGrantError,
  );

  // Verificación cruzada: is_prayer_reader ahora es true para "target".
  const targetUser = await admin.auth.admin.createUser({
    email: `verif-phase1-target-${RUN_ID}@example.com`,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { person_id: target },
  });
  if (targetUser.data?.user) cleanupUserIds.push(targetUser.data.user.id);
  const targetClient = await signIn(`verif-phase1-target-${RUN_ID}@example.com`);
  const { data: canReadPrayer } = await targetClient.rpc("is_prayer_reader");
  ok(
    "Tras el otorgamiento legítimo, la persona SÍ lee peticiones de oración",
    canReadPrayer === true,
  );

  // Revocación: bajar a 'miembro' quita el acceso (sin ser admin).
  const { error: revokeError } = await coordinadorClient
    .from("ministry_memberships")
    .update({ role_in_ministry: "miembro" })
    .eq("ministry_id", prayerMinistry!.id)
    .eq("person_id", target);
  ok("El coordinador SÍ puede revocar (bajar a miembro) sin ser admin", !revokeError, revokeError);

  const { data: canReadAfterRevoke } = await targetClient.rpc("is_prayer_reader");
  ok(
    "Tras la revocación, la persona deja de leer peticiones de oración",
    canReadAfterRevoke === false,
  );
}

async function cleanup() {
  console.log("\nLimpiando datos sintéticos de esta corrida...");
  for (const id of cleanupMinistryIds) {
    await admin.from("ministry_memberships").delete().eq("ministry_id", id);
    await admin.from("ministries").delete().eq("id", id);
  }
  for (const id of cleanupUserIds) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
  for (const id of cleanupPersonIds) {
    try {
      await admin.from("people").delete().eq("id", id);
    } catch {
      // best-effort: alguna persona ya pudo borrarse en cascada arriba.
    }
  }
}

async function main() {
  console.log(`Corrida de verificación FASE 1 — id ${RUN_ID}`);
  try {
    await testIdentityImpersonation();
    await testProfileRelinkBlocked();
    await testInvitationHappyPath();
    await testPastorScope();
    await testPrayerMembershipEscalation();
  } catch (err) {
    console.error("\n💥 Error inesperado durante la corrida:", err);
    failed++;
  } finally {
    await cleanup();
  }

  console.log(`\n${passed} pruebas OK, ${failed} fallidas.`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
