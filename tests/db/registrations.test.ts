/**
 * Inscripción en línea a actividades (0040) contra Postgres aislado.
 * Datos sintéticos.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

let db: PGlite;
let admin: string;
let leader: string;
let otherStaff: string;
let miembro: string;
let activityId: string;

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

// Desde 0048 la inscripción solo la llama el servidor de la app
// (service_role), después de verificar el CAPTCHA.
async function asServer<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role service_role;`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

interface Submit {
  slug?: string;
  first?: string;
  last?: string;
  age?: number;
  phone?: string;
  email?: string;
  terms?: boolean;
}

function submit(s: Submit = {}) {
  return db.query<{ registration_id: string; person_id: string | null; match_status: string }>(
    `select * from submit_activity_registration(
       $1, $2, $3, 'Calle Sintética 1, Ponce', $4, $5, $6,
       'Familiar Prueba', '787-555-0199', true, 'Iglesia Prueba',
       true, 'Asma leve', $7)`,
    [
      s.slug ?? "retiro-prueba",
      s.first ?? "Nombre",
      s.last ?? "Apellido Uno",
      s.age ?? 40,
      s.phone ?? "787-555-0100",
      s.email ?? "uno@example.test",
      s.terms ?? true,
    ],
  );
}

before(async () => {
  db = await createTestDb();
  admin = await createUser(db, "admin-reg", ["administrador"]);
  leader = await createUser(db, "lider-reg");
  otherStaff = await createUser(db, "otro-staff-reg", ["maestro"]);
  miembro = await createUser(db, "miembro-reg");

  const leaderPerson = await personOf(db, leader);
  const { rows: m } = await db.query<{ id: string }>(
    `insert into ministries (name, leader_person_id) values ('Varones', $1) returning id`,
    [leaderPerson],
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into activities (ministry_id, name, activity_date, end_date, status, capacity,
       registration_open, registration_slug, price_cents, deposit_cents)
     values ($1, 'Retiro de prueba', church_today() + 30, church_today() + 32, 'abierta', 3,
       true, 'retiro-prueba', 15000, 5000)
     returning id`,
    [m[0]!.id],
  );
  activityId = rows[0]!.id;
});

after(async () => {
  await db?.close();
});

describe("inscripción en línea", () => {
  test("el público ve la actividad abierta y nada de lo interno", async () => {
    await asAnon(async () => {
      const { rows } = await db.query<{ name: string; is_open: boolean; is_full: boolean }>(
        `select * from public_registration_activity('retiro-prueba')`,
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.is_open, true);
      assert.equal(rows[0]!.is_full, false);
      const none = await db.query(`select * from public_registration_activity('no-existe')`);
      assert.equal(none.rows.length, 0);
      const hidden = await db.query(`select * from activity_registrations`);
      assert.equal(hidden.rows.length, 0);
    });
  });

  test("una persona nueva queda creada, inscrita y vinculada", async () => {
    const { rows } = await asServer(() => submit());
    assert.equal(rows[0]!.match_status, "vinculado");
    const personId = rows[0]!.person_id!;
    const { rows: p } = await db.query<{
      membership_status: string;
      email: string;
      source: string;
      source_activity_id: string;
    }>(`select membership_status, email, source, source_activity_id from people where id = $1`, [
      personId,
    ]);
    assert.equal(p[0]!.membership_status, "visitante");
    assert.equal(p[0]!.email, "uno@example.test");
    assert.equal(p[0]!.source, "inscripcion_actividad");
    assert.equal(p[0]!.source_activity_id, activityId);
    const { rows: part } = await db.query(
      `select 1 from activity_participants where activity_id = $1 and person_id = $2`,
      [activityId, personId],
    );
    assert.equal(part.length, 1);
  });

  test("el origen no se puede cambiar, ni siquiera un administrador", async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from people where source = 'inscripcion_actividad' limit 1`,
    );
    await rejects(
      () =>
        asUser(db, admin, () =>
          db.query(`update people set source = 'manual', source_activity_id = null where id = $1`, [
            rows[0]!.id,
          ]),
        ),
      /origen/,
    );
    const { rows: created } = await asUser(db, admin, () =>
      db.query<{ source: string }>(
        `insert into people (first_name, last_name) values ('Alta', 'Manual') returning source`,
      ),
    );
    assert.equal(created[0]!.source, "manual");
  });

  test("el mismo email no se inscribe dos veces", async () => {
    await rejects(
      () => asServer(() => submit({ email: "UNO@example.test" })),
      /already_registered/,
    );
  });

  test("un posible duplicado NO se vincula solo", async () => {
    const { rows } = await asServer(() =>
      // Mismo teléfono que la persona anterior, otro email.
      submit({ first: "Otro", last: "Nombre", email: "dos@example.test", phone: "(787) 555-0100" }),
    );
    assert.equal(rows[0]!.match_status, "posible_duplicado");
    assert.equal(rows[0]!.person_id, null);
    const { rows: c } = await db.query<{ n: number }>(
      `select cardinality(candidate_person_ids) as n from activity_registrations where id = $1`,
      [rows[0]!.registration_id],
    );
    assert.equal(c[0]!.n, 1);
  });

  test("menores, sin aceptar términos, cupo lleno y cerrada se rechazan", async () => {
    await rejects(() => asServer(() => submit({ age: 16, email: "m@example.test" })), /minor/);
    await rejects(() => asServer(() => submit({ terms: false, email: "t@example.test" })), /terms/);

    await asServer(() =>
      submit({ first: "Tercero", last: "Prueba", email: "tres@example.test", phone: "7875550300" }),
    );
    await rejects(
      () =>
        asServer(() =>
          submit({
            first: "Cuarto",
            last: "Prueba",
            email: "cuatro@example.test",
            phone: "7875550400",
          }),
        ),
      /activity_full/,
    );

    await db.query(
      `update activities set registration_closes_on = church_today() - 1 where id = $1`,
      [activityId],
    );
    await rejects(
      () => asServer(() => submit({ email: "cerrado@example.test" })),
      /registration_closed/,
    );
    await db.query(`update activities set registration_closes_on = null where id = $1`, [
      activityId,
    ]);
  });

  test("solo quien organiza ve las inscripciones (datos médicos)", async () => {
    const seen = await asUser(db, leader, () =>
      db.query(`select medical_details from activity_registrations`),
    );
    assert.equal(seen.rows.length, 3);
    for (const user of [otherStaff, miembro]) {
      const r = await asUser(db, user, () => db.query(`select 1 from activity_registrations`));
      assert.equal(r.rows.length, 0);
    }
    const a = await asUser(db, admin, () => db.query(`select 1 from activity_registrations`));
    assert.equal(a.rows.length, 3);
  });

  test("vincular un duplicado: solo organizadores y solo a una persona sugerida", async () => {
    const { rows } = await db.query<{ id: string; candidate_person_ids: string[] }>(
      `select id, candidate_person_ids from activity_registrations where match_status = 'posible_duplicado'`,
    );
    const reg = rows[0]!;
    await rejects(
      () =>
        asUser(db, otherStaff, () =>
          db.query(`select link_activity_registration($1, $2)`, [
            reg.id,
            reg.candidate_person_ids[0],
          ]),
        ),
      /permiso/,
    );
    // Un líder que no es staff global no puede vincular a alguien fuera de las sugeridas.
    const outsider = await personOf(db, miembro);
    await rejects(
      () =>
        asUser(db, leader, () =>
          db.query(`select link_activity_registration($1, $2)`, [reg.id, outsider]),
        ),
      /sugeridas/,
    );
    await asUser(db, leader, () =>
      db.query(`select link_activity_registration($1, $2)`, [reg.id, reg.candidate_person_ids[0]]),
    );
    const { rows: after } = await db.query<{ match_status: string }>(
      `select match_status from activity_registrations where id = $1`,
      [reg.id],
    );
    assert.equal(after[0]!.match_status, "vinculado");
  });

  test("los pagos actualizan lo pagado y solo los registra quien organiza", async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from activity_registrations where email = 'uno@example.test'`,
    );
    const regId = rows[0]!.id;
    await asUser(db, leader, () =>
      db.query(
        `insert into activity_registration_payments (registration_id, amount_cents, method, paid_on)
         values ($1, 5000, 'ath_movil', church_today()), ($1, 2500, 'efectivo', church_today())`,
        [regId],
      ),
    );
    const { rows: r } = await db.query<{ amount_paid_cents: number }>(
      `select amount_paid_cents from activity_registrations where id = $1`,
      [regId],
    );
    assert.equal(r[0]!.amount_paid_cents, 7500);

    await rejects(
      () =>
        asUser(db, otherStaff, () =>
          db.query(
            `insert into activity_registration_payments (registration_id, amount_cents, method, paid_on)
             values ($1, 100, 'efectivo', church_today())`,
            [regId],
          ),
        ),
      /row-level security/,
    );
  });

  test("el público no puede llamar la inscripción directo (sin pasar por el CAPTCHA)", async () => {
    await rejects(
      () => asAnon(() => submit({ email: "directo@example.test" })),
      /permission denied/,
    );
  });

  test("el público no puede insertar directamente", async () => {
    await rejects(
      () =>
        asAnon(() =>
          db.query(
            `insert into activity_registrations (activity_id, first_name, last_name, address, age, phone,
               email, emergency_name, emergency_phone, attends_church, has_medical_condition,
               terms_accepted_at, match_status)
             values ($1, 'X', 'Y', 'Z', 30, '7875550000', 'x@example.test', 'F', '7875550001',
               false, false, now(), 'posible_duplicado')`,
            [activityId],
          ),
        ),
      /row-level security|permission/,
    );
  });
});
