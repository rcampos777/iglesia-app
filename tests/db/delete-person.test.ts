/**
 * Borrar personas creadas por error (0046). Datos sintéticos.
 *   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

let db: PGlite;
let apostol: string;
let admin: string;

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

async function q<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
}

async function person(first: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into people (first_name, last_name) values ($1, 'Prueba') returning id`,
    [first],
  );
  return rows[0]!.id;
}

async function exists(table: string, id: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from ${table} where id = $1`, [id]);
  return rows.length > 0;
}

before(async () => {
  db = await createTestDb();
  apostol = await createUser(db, "apostol-del");
  admin = await createUser(db, "admin-del", ["administrador"]);
  await db.query(`select bootstrap_first_apostol($1, 'Prueba: alta inicial sintética')`, [apostol]);
});

after(async () => {
  await db.close();
});

describe("borrar persona", () => {
  test("solo SuperAdmin; el administrador no", async () => {
    const id = await person("SinNada");
    await rejects(
      () => q(admin, `select delete_person($1, 'creada por error')`, [id]),
      /No autorizado/,
    );
    await rejects(() => q(admin, `select person_delete_blockers($1)`, [id]), /No autorizado/);
    assert.ok(await exists("people", id));
  });

  test("borra a una persona sin nada ligado y lo anota en la bitácora", async () => {
    const id = await person("Duplicada");
    // Un email enviado solo la menciona: no bloquea, se desliga.
    const { rows: log } = await db.query<{ id: string }>(
      `insert into notification_log (recipient_person_id, template_code) values ($1, 'prueba') returning id`,
      [id],
    );
    await rejects(() => q(apostol, `select delete_person($1, 'x')`, [id]), /motivo/);
    await q(apostol, `select delete_person($1, 'Creada por error')`, [id]);
    assert.equal(await exists("people", id), false);
    assert.ok(await exists("notification_log", log[0]!.id), "la bitácora de emails se conserva");
    const { rows } = await db.query<{ metadata: { name: string; reason: string } }>(
      `select metadata from audit_log where action = 'person.delete' and entity_id = $1`,
      [id],
    );
    assert.equal(rows[0]!.metadata.name, "Duplicada Prueba");
    assert.equal(rows[0]!.metadata.reason, "Creada por error");
  });

  test("borra también la cuenta de acceso", async () => {
    const user = await createUser(db, "cuenta-por-error");
    const id = await personOf(db, user);
    await q(apostol, `select delete_person($1, 'Cuenta creada por error')`, [id]);
    assert.equal(await exists("people", id), false);
    assert.equal(await exists("auth.users", user), false);
    const { rows } = await db.query(`select 1 from profiles where id = $1`, [user]);
    assert.equal(rows.length, 0);
  });

  test("no borra si tiene algo ligado, y dice qué", async () => {
    const id = await person("ConMinisterio");
    const { rows: m } = await db.query<{ id: string }>(
      `insert into ministries (name) values ('Alabanza') returning id`,
    );
    await db.query(`insert into ministry_memberships (ministry_id, person_id) values ($1, $2)`, [
      m[0]!.id,
      id,
    ]);
    const blockers = await q<{ b: Record<string, number> }>(
      apostol,
      `select person_delete_blockers($1) as b`,
      [id],
    );
    assert.deepEqual(blockers[0]!.b, { ministerios: 1 });
    await rejects(
      () => q(apostol, `select delete_person($1, 'Creada por error')`, [id]),
      /tiene_registros/,
    );
    assert.ok(await exists("people", id));
  });

  test("no borra la propia cuenta", async () => {
    const id = await personOf(db, apostol);
    await rejects(
      () => q(apostol, `select delete_person($1, 'Prueba propia')`, [id]),
      /propia cuenta/,
    );
  });
});
