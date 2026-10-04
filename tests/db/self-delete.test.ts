/**
 * Aviso de privacidad y borrado del propio perfil (0049). Datos sintéticos.
 *   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

let db: PGlite;
let apostol: string;

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

async function q<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
}

async function deleteMine(user: string): Promise<string> {
  const rows = await q<{ r: string }>(user, `select delete_my_account('BORRAR') as r`);
  return rows[0]!.r;
}

async function one<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await db.query<T>(sql, params)).rows[0];
}

before(async () => {
  db = await createTestDb();
  apostol = await createUser(db, "apostol-self");
  await db.query(`select bootstrap_first_apostol($1, 'Prueba: alta inicial sintética')`, [apostol]);
});

after(async () => {
  await db.close();
});

describe("aviso de privacidad", () => {
  test("cada cuenta registra su propia aceptación", async () => {
    const u = await createUser(db, "acepta");
    await q(u, `select accept_privacy_notice('2026-10-03')`);
    const p = await one<{ privacy_version: string; privacy_accepted_at: string | null }>(
      `select privacy_version, privacy_accepted_at from profiles where id = $1`,
      [u],
    );
    assert.equal(p?.privacy_version, "2026-10-03");
    assert.ok(p?.privacy_accepted_at);
    await rejects(() => q(u, `select accept_privacy_notice('cualquier cosa')`), /Versión inválida/);
  });
});

describe("borrar mi perfil", () => {
  test("pide escribir BORRAR", async () => {
    const u = await createUser(db, "confirma");
    await rejects(() => q(u, `select delete_my_account('si')`), /BORRAR/);
  });

  test("sin historial: se borran la persona y la cuenta", async () => {
    const u = await createUser(db, "sin-historial");
    const p = await personOf(db, u);
    assert.equal(await deleteMine(u), "borrado");
    assert.equal(await one(`select 1 from people where id = $1`, [p]), undefined);
    assert.equal(await one(`select 1 from auth.users where id = $1`, [u]), undefined);
    const log = await one<{ actor_user_id: string | null; metadata: { result: string } }>(
      `select actor_user_id, metadata from audit_log where action = 'person.self_delete' and entity_id = $1`,
      [p],
    );
    assert.equal(log?.actor_user_id, null);
    assert.equal(log?.metadata.result, "borrado");
  });

  test("con historial: se anonimiza, se borran peticiones y la cuenta", async () => {
    const u = await createUser(db, "con-historial");
    const p = await personOf(db, u);
    await db.query(
      `update people set phone = '787-555-0101', notes = 'nota privada' where id = $1`,
      [p],
    );
    const m = await one<{ id: string }>(
      `insert into ministries (name) values ('Ujieres') returning id`,
    );
    await db.query(`insert into ministry_memberships (ministry_id, person_id) values ($1, $2)`, [
      m!.id,
      p,
    ]);
    await db.query(
      `insert into prayer_requests (requester_person_id, content) values ($1, 'Petición sintética')`,
      [p],
    );

    assert.equal(await deleteMine(u), "anonimizado");

    const row = await one<{
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      notes: string | null;
      anonymized_at: string | null;
    }>(
      `select first_name, last_name, email, phone, notes, anonymized_at from people where id = $1`,
      [p],
    );
    assert.equal(row?.first_name, "Persona");
    assert.equal(row?.last_name, "eliminada");
    assert.equal(row?.email, null);
    assert.equal(row?.phone, null);
    assert.equal(row?.notes, null);
    assert.ok(row?.anonymized_at);
    // La estadística se conserva sin nombre.
    assert.ok(await one(`select 1 from ministry_memberships where person_id = $1`, [p]));
    assert.equal(
      await one(`select 1 from prayer_requests where requester_person_id = $1`, [p]),
      undefined,
    );
    assert.equal(await one(`select 1 from profiles where id = $1`, [u]), undefined);
  });

  test("si la cuenta está referenciada, se vacía y se bloquea en vez de borrarse", async () => {
    const u = await createUser(db, "personal-ref", ["seguimiento"]);
    // Invitaciones al portal que creó (0027: referencia sin ON DELETE).
    const other = await one<{ id: string }>(
      `insert into people (first_name, last_name) values ('Otra', 'Persona') returning id`,
    );
    await db.query(
      `insert into portal_invitations (person_id, email, token_hash, created_by, expires_at)
       values ($1, 'otra@example.test', 'hash-sintetico', $2, now() + interval '1 day')`,
      [other!.id, u],
    );

    assert.equal(await deleteMine(u), "borrado");
    const acc = await one<{
      email: string;
      raw_user_meta_data: object;
      banned_until: string | null;
    }>(`select email, raw_user_meta_data, banned_until from auth.users where id = $1`, [u]);
    assert.match(acc!.email, /^eliminada-.*@invalid\.invalid$/);
    assert.deepEqual(acc!.raw_user_meta_data, {});
    assert.ok(acc!.banned_until);
    assert.equal(await one(`select 1 from user_roles where user_id = $1`, [u]), undefined);
    assert.equal(await one(`select 1 from profiles where id = $1`, [u]), undefined);
  });

  test("con certificaciones o donaciones: se va la cuenta y el registro queda para revisión", async () => {
    const u = await createUser(db, "con-certificacion");
    const p = await personOf(db, u);
    const t = await one<{ id: string }>(`select id from certification_types limit 1`);
    await db.query(`insert into person_certifications (person_id, type_id) values ($1, $2)`, [
      p,
      t!.id,
    ]);

    assert.equal(await deleteMine(u), "pendiente_revision");
    const row = await one<{ first_name: string; deletion_requested_at: string | null }>(
      `select first_name, deletion_requested_at from people where id = $1`,
      [p],
    );
    assert.notEqual(row?.first_name, "Persona");
    assert.ok(row?.deletion_requested_at);
    assert.equal(await one(`select 1 from auth.users where id = $1`, [u]), undefined);
  });

  test("SuperAdmin y Finanzas no pueden borrarse a sí mismos", async () => {
    await rejects(() => deleteMine(apostol), /SuperAdmin o Finanzas/);
  });
});

describe("anonimizar (SuperAdmin)", () => {
  test("solo SuperAdmin, con motivo; queda en la bitácora", async () => {
    const admin = await createUser(db, "admin-anon", ["administrador"]);
    const { rows } = await db.query<{ id: string }>(
      `insert into people (first_name, last_name, email) values ('Ana', 'Sintética', 'ana@example.test') returning id`,
    );
    const p = rows[0]!.id;
    await rejects(
      () => q(admin, `select anonymize_person($1, 'pidió borrar')`, [p]),
      /No autorizado/,
    );
    await rejects(() => q(apostol, `select anonymize_person($1, 'x')`, [p]), /motivo/);

    await q(apostol, `select anonymize_person($1, 'La persona pidió borrar sus datos')`, [p]);
    const row = await one<{ first_name: string; email: string | null }>(
      `select first_name, email from people where id = $1`,
      [p],
    );
    assert.equal(row?.first_name, "Persona");
    assert.equal(row?.email, null);
    assert.ok(
      await one(`select 1 from audit_log where action = 'person.anonymize' and entity_id = $1`, [
        p,
      ]),
    );
    await rejects(
      () => q(apostol, `select anonymize_person($1, 'otra vez aquí')`, [p]),
      /ya anonimizada/,
    );
  });
});
