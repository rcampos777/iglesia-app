/**
 * Certificaciones de ministros (0042) contra Postgres aislado.
 * Datos sintéticos.   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let apostol: string;
let finanzas: string;
let admin: string;
let pastor: string;
let personId: string;
let typeId: string;
let certId: string;

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

async function q<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
}

before(async () => {
  db = await createTestDb();
  apostol = await createUser(db, "apostol-cert");
  finanzas = await createUser(db, "finanzas-cert");
  admin = await createUser(db, "admin-cert", ["administrador"]);
  pastor = await createUser(db, "pastor-cert", ["pastor"]);
  await db.query(`select bootstrap_first_apostol($1, 'Prueba: alta inicial sintética')`, [apostol]);
  await q(apostol, `select apostol_set_financial_role($1, 'finanzas', true, 'Tesorería')`, [
    finanzas,
  ]);
  personId = (
    await db.query<{ id: string }>(
      `insert into people (first_name, last_name) values ('Servidor', 'Jóvenes') returning id`,
    )
  ).rows[0]!.id;
  typeId = (
    await db.query<{ id: string }>(`select id from certification_types where name like '%Ley 300%'`)
  ).rows[0]!.id;
});

after(async () => {
  await db.close();
});

describe("certificaciones", () => {
  test("finanzas registra una certificación y queda auditada", async () => {
    const path = `${personId}/${randomUUID()}.pdf`;
    const rows = await q<{ id: string }>(
      finanzas,
      `insert into person_certifications (person_id, type_id, issued_on, expires_on, file_path, file_name)
       values ($1, $2, '2026-01-10', '2027-01-10', $3, 'ley300.pdf') returning id`,
      [personId, typeId, path],
    );
    certId = rows[0]!.id;
    const { rows: log } = await db.query<{ action: string }>(
      `select action from finance_audit_log where entity_id = $1`,
      [certId],
    );
    assert.deepEqual(
      log.map((l) => l.action),
      ["certificacion.crear"],
    );
  });

  test("apóstol y finanzas la ven con el nombre; administrador y pastor no", async () => {
    for (const u of [apostol, finanzas]) {
      const rows = await q<{ person_name: string; has_file: boolean }>(
        u,
        `select * from certifications_list()`,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.person_name, "Servidor Jóvenes");
      assert.equal(rows[0]!.has_file, true);
    }
    for (const u of [admin, pastor]) {
      await rejects(() => q(u, `select * from certifications_list()`), /No autorizado/);
      const direct = await q(u, `select * from person_certifications`);
      assert.equal(direct.length, 0);
      const types = await q(u, `select * from certification_types`);
      assert.equal(types.length, 0);
      await rejects(
        () =>
          q(u, `insert into person_certifications (person_id, type_id) values ($1, $2)`, [
            personId,
            typeId,
          ]),
        /row-level security/,
      );
    }
  });

  test("abrir el archivo queda registrado; sin acceso no se puede", async () => {
    const rows = await q<{ path: string }>(
      finanzas,
      `select certification_log_file_view($1) as path`,
      [certId],
    );
    assert.match(rows[0]!.path, /\.pdf$/);
    const { rows: log } = await db.query(
      `select 1 from finance_audit_log where entity_id = $1 and action = 'certificacion.ver_archivo'`,
      [certId],
    );
    assert.equal(log.length, 1);
    await rejects(
      () => q(admin, `select certification_log_file_view($1)`, [certId]),
      /No autorizado/,
    );
  });

  test("validaciones: fechas y ruta de archivo", async () => {
    await rejects(
      () =>
        q(
          finanzas,
          `insert into person_certifications (person_id, type_id, issued_on, expires_on)
           values ($1, $2, '2026-05-01', '2026-01-01')`,
          [personId, typeId],
        ),
      /dates_check/,
    );
    await rejects(
      () =>
        q(
          finanzas,
          `insert into person_certifications (person_id, type_id, file_path) values ($1, $2, '../otro/archivo.pdf')`,
          [personId, typeId],
        ),
      /file_path/,
    );
  });

  test("solo el apóstol borra", async () => {
    const gone = await q(finanzas, `delete from person_certifications where id = $1 returning id`, [
      certId,
    ]);
    assert.equal(gone.length, 0);
    const deleted = await q(
      apostol,
      `delete from person_certifications where id = $1 returning id`,
      [certId],
    );
    assert.equal(deleted.length, 1);
    const { rows: log } = await db.query(
      `select 1 from finance_audit_log where entity_id = $1 and action = 'certificacion.borrar'`,
      [certId],
    );
    assert.equal(log.length, 1);
  });
});
