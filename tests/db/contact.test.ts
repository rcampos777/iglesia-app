/**
 * Forma de contacto del sitio (0056) contra Postgres aislado. Datos sintéticos.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser } from "./harness";

let db: PGlite;
let admin: string;
let seguimiento: string;
let editor: string;
let pastor: string;
let miembro: string;

async function as<T>(role: "anon" | "service_role", fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

async function submit(email: string | null, phone: string | null = null) {
  const { rows } = await db.query<{ id: string }>(
    `select submit_site_contact('Visitante Prueba', $1, $2, 'Quisiera información de los cultos.') as id`,
    [email, phone],
  );
  return rows[0]!.id;
}

before(async () => {
  db = await createTestDb();
  admin = await createUser(db, "admin-contacto", ["administrador"]);
  seguimiento = await createUser(db, "seguimiento-contacto", ["seguimiento"]);
  editor = await createUser(db, "editor-contacto", ["sitio_web"]);
  pastor = await createUser(db, "pastor-contacto", ["pastor"]);
  miembro = await createUser(db, "miembro-contacto");
});

after(async () => {
  await db?.close();
});

describe("forma de contacto", () => {
  test("el público no puede llamar la función ni escribir en la tabla", async () => {
    await as("anon", async () => {
      await assert.rejects(() => submit("anon@example.test"), /permission denied/);
      await assert.rejects(
        () =>
          db.query(
            `insert into site_contact_messages (name, email, message) values ('x', 'x@example.test', 'hola')`,
          ),
        /row-level security|permission denied/,
      );
    });
  });

  test("el servidor guarda el mensaje; pide correo o teléfono", async () => {
    await as("service_role", async () => {
      const id = await submit("  Visita@Example.test ");
      const { rows } = await db.query<{ email: string; status: string }>(
        `select email, status from site_contact_messages where id = $1`,
        [id],
      );
      assert.deepEqual(rows[0], { email: "visita@example.test", status: "nuevo" });
      await submit(null, "787-555-0100");
      await assert.rejects(() => submit(null, "  "), /contact_missing/);
    });
  });

  test("máximo 3 mensajes por correo en una hora", async () => {
    await as("service_role", async () => {
      await submit("repetido@example.test");
      await submit("repetido@example.test");
      await submit("repetido@example.test");
      await assert.rejects(() => submit("repetido@example.test"), /too_many/);
    });
  });

  test("solo administrador y seguimiento leen los mensajes", async () => {
    for (const [user, expected] of [
      [admin, true],
      [seguimiento, true],
      [editor, false],
      [pastor, false],
      [miembro, false],
    ] as const) {
      const n = await asUser(db, user, async () => {
        const { rows } = await db.query<{ n: number }>(
          `select count(*)::int as n from site_contact_messages`,
        );
        return rows[0]!.n;
      });
      assert.equal(n > 0, expected, `usuario ${user}`);
    }
  });

  test("se marca atendido pero el texto no se edita", async () => {
    await asUser(db, seguimiento, async () => {
      await db.query(
        `update site_contact_messages set status = 'atendido', handled_at = now() where email = 'visita@example.test'`,
      );
      await assert.rejects(
        () => db.query(`update site_contact_messages set message = 'cambiado'`),
        /contact_readonly/,
      );
    });
    const { rows } = await db.query<{ status: string }>(
      `select status from site_contact_messages where email = 'visita@example.test'`,
    );
    assert.equal(rows[0]!.status, "atendido");
  });
});
