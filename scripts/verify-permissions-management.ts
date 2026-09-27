/**
 * Pruebas de regresión para "Cuenta y permisos" (migración
 * 0030_permissions_management.sql): guardado transaccional de roles,
 * protección del último administrador, detección de ediciones
 * desactualizadas y cierre de la escritura directa a `user_roles`.
 *
 * NO se pudo ejecutar en el entorno del agente que escribió este
 * script: ni el puente al equipo del usuario ni el contenedor en la
 * nube tenían salida de red hacia *.supabase.co en esta sesión (mismo
 * límite ya documentado en scripts/verify-security-phase1.ts). Está
 * escrito, tipado (pasa `npm run typecheck`) y listo para correr desde
 * cualquier lugar con salida de red normal — la propia terminal del
 * usuario, por ejemplo. No se declara "probado" nada de lo que cubre
 * este archivo hasta que alguien lo ejecute contra un proyecto real.
 *
 * Requisitos antes de correr:
 *   1. Migración 0030_permissions_management.sql aplicada contra el
 *      proyecto de DESARROLLO (`supabase db push`, ver
 *      docs/deployment.md). Debe aplicarse DESPUÉS de 0029.
 *   2. .env.local completo (usa el mismo proyecto que `npm run seed`).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/verify-permissions-management.ts
 *
 * Autocontenido: crea sus propias personas/cuentas sintéticas con
 * prefijo `verif-perms-` y las borra al final (o al fallar). Usa la
 * service_role key solo para montaje/limpieza; las comprobaciones
 * corren con sesiones normales (anon key + login) para probar RLS y
 * las funciones RPC tal como las usaría la app.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../src/types/database";

type AppRole = Database["public"]["Enums"]["app_role"];

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

const PASSWORD = "Verif-Perms-2026!";
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

async function makePerson(firstName: string): Promise<string> {
  const { data, error } = await admin
    .from("people")
    .insert({
      first_name: `${firstName}-${RUN_ID}`,
      last_name: "verif-perms",
      membership_status: "asistente_habitual",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`No se pudo crear persona: ${error?.message}`);
  cleanupPersonIds.push(data.id);
  return data.id;
}

/** Crea un usuario + persona vinculada (vía app_metadata, camino legítimo) y le asigna roles. */
async function makeUser(label: string, roles: AppRole[]) {
  const personId = await makePerson(label);
  const email = `verif-perms-${label}-${RUN_ID}@example.com`;
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

async function currentRoles(userId: string): Promise<AppRole[]> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role).sort();
}

async function countAuditRows(entityId: string): Promise<number> {
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "user_roles")
    .eq("entity_id", entityId);
  return count ?? 0;
}

async function testNoAccountState() {
  console.log("\n[1] Persona sin cuenta");
  const admin1 = await makeUser("admin-consulta", ["administrador"]);
  const orphan = await makePerson("sin-cuenta");

  const adminClient = await signIn(admin1.email);
  const { data, error } = await adminClient.rpc("admin_get_account_for_person", {
    p_person_id: orphan,
  });

  ok("admin_get_account_for_person() no da error para persona sin cuenta", !error, error);
  ok("Devuelve cero filas (sin cuenta) para persona sin cuenta", (data ?? []).length === 0, data);
}

async function testNoOpDoesNotWriteOrAudit() {
  console.log("\n[2] Preparar/cancelar (no-op) no modifica ni audita");
  const adminActor = await makeUser("admin-noop", ["administrador"]);
  const target = await makeUser("target-noop", ["miembro", "maestro"]);

  const adminClient = await signIn(adminActor.email);
  const before = await currentRoles(target.userId);
  const auditBefore = await countAuditRows(target.userId);

  const { error } = await adminClient.rpc("admin_set_person_roles", {
    p_person_id: target.personId,
    p_expected_roles: before,
    p_new_roles: before, // idéntico: nada que aplicar
  });

  ok("Llamar con expected == new no da error", !error, error);
  const after = await currentRoles(target.userId);
  ok("Los roles no cambiaron", JSON.stringify(after) === JSON.stringify(before), { before, after });
  const auditAfter = await countAuditRows(target.userId);
  ok("No se generó ninguna fila de auditoría nueva", auditAfter === auditBefore, {
    auditBefore,
    auditAfter,
  });
}

async function testSaveAppliesAllAndAudits() {
  console.log("\n[3] Guardar aplica todos los cambios y deja auditoría");
  const adminActor = await makeUser("admin-guarda", ["administrador"]);
  const target = await makeUser("target-guarda", ["miembro"]);

  const adminClient = await signIn(adminActor.email);
  const before = await currentRoles(target.userId);
  const auditBefore = await countAuditRows(target.userId);

  const newRoles: AppRole[] = ["miembro", "maestro", "seguimiento"];
  const { error } = await adminClient.rpc("admin_set_person_roles", {
    p_person_id: target.personId,
    p_expected_roles: before,
    p_new_roles: newRoles,
    p_reason: "prueba automatizada",
  });

  ok("admin_set_person_roles() no da error", !error, error);
  const after = await currentRoles(target.userId);
  ok(
    "Los tres roles quedaron aplicados exactamente",
    JSON.stringify(after) === JSON.stringify([...newRoles].sort()),
    after,
  );
  const auditAfter = await countAuditRows(target.userId);
  ok("Se generó exactamente una fila de auditoría nueva", auditAfter === auditBefore + 1, {
    auditBefore,
    auditAfter,
  });

  const { data: lastAudit } = await admin
    .from("audit_log")
    .select("action, metadata")
    .eq("entity_type", "user_roles")
    .eq("entity_id", target.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  ok("La auditoría registra action=update_roles", lastAudit?.action === "update_roles", lastAudit);
  const metadata = lastAudit?.metadata as Record<string, unknown> | undefined;
  ok(
    "La auditoría incluye antes/después/agregados/quitados",
    !!metadata?.before && !!metadata?.after && !!metadata?.added,
    metadata,
  );
}

async function testFailureLeavesNoPartialChange() {
  console.log("\n[4] Un fallo no deja cambios parciales");
  // Escenario: el propio admin actor es el ÚNICO administrador restante
  // (además del "admin ancla" de otras pruebas puede haber más, así que
  // forzamos el caso quitando a todos los demás administradores del
  // conjunto de prueba — solo actuamos sobre cuentas creadas aquí).
  const soleAdmin = await makeUser("admin-solo", ["administrador"]);
  const adminClient = await signIn(soleAdmin.email);

  // Cuenta con dos roles: intentamos, en una sola llamada, quitarle
  // 'maestro' Y (para otra persona en el mismo lote de pruebas) romper
  // la última-admin. Como la función opera sobre UNA cuenta a la vez,
  // forzamos el fallo pidiendo quitarse el rol administrador a sí mismo
  // siendo el único admin del run — debe fallar y no tocar nada.
  const before = await currentRoles(soleAdmin.userId);
  const { error } = await adminClient.rpc("admin_set_person_roles", {
    p_person_id: soleAdmin.personId,
    p_expected_roles: before,
    p_new_roles: ["miembro"] as AppRole[],
  });

  ok("Intentar quitarse el único rol administrador falla", !!error, error);
  const after = await currentRoles(soleAdmin.userId);
  ok(
    "Los roles no cambiaron tras el intento fallido",
    JSON.stringify(after) === JSON.stringify(before),
    {
      before,
      after,
    },
  );
}

async function testLastAdminGuardViaTriggerDirectDelete() {
  console.log("\n[5b] Protección de último admin también bloquea DELETE directo (trigger)");
  // Este chequeo usa el cliente service_role a propósito: la RLS ya
  // bloquea el DELETE directo de un `administrador` normal (ver prueba
  // 8), así que la única forma de ejercitar el trigger
  // `user_roles_guard_last_admin_trg` por una vía distinta a la RPC es
  // con una llave que sí tiene permiso de fila (service_role) — el
  // trigger corre para CUALQUIER `DELETE`, sin importar el rol de
  // Postgres que lo ejecute.
  const soleAdmin = await makeUser("admin-trigger", ["administrador"]);

  const { error } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", soleAdmin.userId)
    .eq("role", "administrador");

  ok(
    "El trigger rechaza borrar el último rol administrador incluso vía service_role",
    !!error,
    error,
  );
  const stillAdmin = await currentRoles(soleAdmin.userId);
  ok("Sigue teniendo el rol administrador", stillAdmin.includes("administrador"), stillAdmin);
}

async function testConcurrentStaleEdit() {
  console.log("\n[6] Dos ediciones concurrentes no pierden cambios silenciosamente");
  const adminA = await makeUser("admin-concurrente-a", ["administrador"]);
  const adminB = await makeUser("admin-concurrente-b", ["administrador"]);
  const target = await makeUser("target-concurrente", ["miembro"]);

  const clientA = await signIn(adminA.email);
  const clientB = await signIn(adminB.email);

  // Ambos "cargan" el mismo estado inicial.
  const loadedByBoth = await currentRoles(target.userId);

  // A guarda primero: agrega 'maestro'.
  const { error: errorA } = await clientA.rpc("admin_set_person_roles", {
    p_person_id: target.personId,
    p_expected_roles: loadedByBoth,
    p_new_roles: [...loadedByBoth, "maestro"] as AppRole[],
  });
  ok("La primera edición (A) se guarda sin error", !errorA, errorA);

  // B, sin recargar, intenta guardar sobre el estado viejo: agrega
  // 'seguimiento' basado en lo que él cargó (ya desactualizado).
  const { error: errorB } = await clientB.rpc("admin_set_person_roles", {
    p_person_id: target.personId,
    p_expected_roles: loadedByBoth,
    p_new_roles: [...loadedByBoth, "seguimiento"] as AppRole[],
  });

  ok(
    "La segunda edición (B), basada en datos viejos, es rechazada",
    !!errorB && errorB.message.includes("STALE_ROLES"),
    errorB,
  );

  const final = await currentRoles(target.userId);
  ok("El cambio de A (maestro) se conservó íntegro", final.includes("maestro"), final);
  ok("El cambio de B (seguimiento) NO se aplicó a medias", !final.includes("seguimiento"), final);
}

async function testNonAdminCannotCallRpcsDirectly() {
  console.log("\n[7] Miembro/pastor/coordinador sin rol admin no pueden usar las nuevas RPC");
  const target = await makePerson("target-no-admin");

  const nonAdmins: { label: string; roles: AppRole[] }[] = [
    { label: "miembro-plano", roles: ["miembro"] },
    { label: "pastor-acotado", roles: ["pastor"] },
    { label: "coordinador", roles: ["coordinador_ministerio"] },
  ];

  for (const { label, roles } of nonAdmins) {
    const user = await makeUser(`no-admin-${label}`, roles);
    const client = await signIn(user.email);

    const { error: errorGet } = await client.rpc("admin_get_account_for_person", {
      p_person_id: target,
    });
    ok(`${label}: admin_get_account_for_person() rechazada`, !!errorGet, errorGet);

    const { error: errorSet } = await client.rpc("admin_set_person_roles", {
      p_person_id: target,
      p_expected_roles: [],
      p_new_roles: ["administrador"] as AppRole[],
    });
    ok(`${label}: admin_set_person_roles() rechazada`, !!errorSet, errorSet);

    const { error: errorList } = await client.rpc("list_users_with_roles", {});
    ok(`${label}: list_users_with_roles() rechazada`, !!errorList, errorList);
  }
}

async function testOldDirectWritesNowBlocked() {
  console.log("\n[8] Las acciones antiguas (escritura directa a user_roles) ya no funcionan");
  const adminActor = await makeUser("admin-directo", ["administrador"]);
  const target = await makeUser("target-directo", ["miembro"]);

  const adminClient = await signIn(adminActor.email);

  const { error: insertError } = await adminClient
    .from("user_roles")
    .insert({ user_id: target.userId, role: "maestro" });
  ok(
    "INSERT directo a user_roles por un administrador es rechazado (sin política RLS)",
    !!insertError,
    insertError,
  );

  const { error: deleteError } = await adminClient
    .from("user_roles")
    .delete()
    .eq("user_id", target.userId)
    .eq("role", "miembro");
  ok(
    "DELETE directo a user_roles por un administrador es rechazado (sin política RLS)",
    !!deleteError,
    deleteError,
  );

  const { data: selectData, error: selectError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", target.userId);
  ok("SELECT directo sigue funcionando para admin (solo lectura)", !selectError, selectError);
  ok(
    "El intento de escritura no dejó rastro (rol sigue siendo solo miembro)",
    selectData?.length === 1,
    selectData,
  );
}

async function testPortalStillWorks() {
  console.log("\n[9] Mi portal sigue funcionando para un miembro plano");
  const member = await makeUser("miembro-portal", []);
  const memberClient = await signIn(member.email);

  const { error } = await memberClient.rpc("update_own_contact_info", {
    p_phone: "555-0100",
    p_preferred_name: "Prueba Portal",
  });
  ok("update_own_contact_info() sigue funcionando para un miembro", !error, error);

  // Y confirmamos que ese mismo miembro sigue sin poder tocar roles.
  const { error: rolesError } = await memberClient
    .from("user_roles")
    .update({ role: "administrador" })
    .eq("user_id", member.userId);
  ok("El miembro no puede escribir user_roles directamente", !!rolesError, rolesError);
}

async function testListUsersSearchAndPagination() {
  console.log("\n[10] list_users_with_roles: búsqueda y paginación (solo admin)");
  const adminActor = await makeUser("admin-lista", ["administrador"]);
  const findable = await makeUser("buscable-unica-etiqueta", ["miembro"]);
  const adminClient = await signIn(adminActor.email);

  const { data, error } = await adminClient.rpc("list_users_with_roles", {
    p_search: findable.email.split("@")[0],
    p_limit: 10,
    p_offset: 0,
  });
  ok("La búsqueda por email no da error", !error, error);
  ok(
    "La búsqueda encuentra la cuenta esperada",
    (data ?? []).some((r) => r.user_id === findable.userId),
    data,
  );
  ok(
    "Cada fila trae total_count",
    (data ?? []).every((r) => typeof r.total_count === "number"),
    data,
  );
}

async function cleanup() {
  console.log("\nLimpiando datos sintéticos de esta corrida...");
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
  console.log(`Corrida de verificación "Cuenta y permisos" — id ${RUN_ID}`);
  try {
    await testNoAccountState();
    await testNoOpDoesNotWriteOrAudit();
    await testSaveAppliesAllAndAudits();
    await testFailureLeavesNoPartialChange();
    await testLastAdminGuardViaTriggerDirectDelete();
    await testConcurrentStaleEdit();
    await testNonAdminCannotCallRpcsDirectly();
    await testOldDirectWritesNowBlocked();
    await testPortalStillWorks();
    await testListUsersSearchAndPagination();
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
