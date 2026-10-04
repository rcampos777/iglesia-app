/**
 * Dirección completa del perfil (0051). Datos sintéticos.
 *   npm run test:db
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

let db: PGlite;

before(async () => {
  db = await createTestDb();
});

after(async () => {
  await db.close();
});

type Addr = {
  address_line: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
};

async function address(person: string): Promise<Addr> {
  const { rows } = await db.query<Addr>(
    `select address_line, address_line2, city, postal_code, country from people where id = $1`,
    [person],
  );
  return rows[0]!;
}

test("el miembro corrige su dirección completa desde Mi portal", async () => {
  const u = await createUser(db, "direccion");
  const p = await personOf(db, u);
  await asUser(db, u, () =>
    db.query(
      `select update_own_contact_info(
         p_address_line => 'Calle Sintética 1', p_address_line2 => 'Urb. Prueba',
         p_city => 'Ponce', p_postal_code => '00716', p_country => 'Puerto Rico')`,
    ),
  );
  assert.deepEqual(await address(p), {
    address_line: "Calle Sintética 1",
    address_line2: "Urb. Prueba",
    city: "Ponce",
    postal_code: "00716",
    country: "Puerto Rico",
  });

  // Borrar mi perfil también quita los campos nuevos (0049 + 0051).
  const m = await db.query<{ id: string }>(
    `insert into ministries (name) values ('Coro') returning id`,
  );
  await db.query(`insert into ministry_memberships (ministry_id, person_id) values ($1, $2)`, [
    m.rows[0]!.id,
    p,
  ]);
  await asUser(db, u, () => db.query(`select delete_my_account('BORRAR')`));
  assert.deepEqual(await address(p), {
    address_line: null,
    address_line2: null,
    city: null,
    postal_code: null,
    country: null,
  });
});
