/**
 * Donaciones y Finanzas (0034–0035) contra un Postgres aislado en memoria.
 * Datos 100 % sintéticos.   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

type Json = Record<string, unknown>;
let db: PGlite;
let apostol: string;
let finanzas: string;
let admin: string;
let pastor: string;
let ujier: string;
let miembro: string;
let intercesor: string;
let donorId: string; // persona sin cuenta
let donor2Id: string;

const ALL_TYPES = ["diezmo", "ofrenda", "semilla", "primicias"];
const ALL_METHODS = ["efectivo", "ath", "credito", "ath_movil", "cheque", "giro"];

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

async function q<T = Json>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
}

type NewDonation = {
  key?: string;
  person?: string | null;
  anonymous?: boolean;
  date?: string;
  cents?: number;
  type?: string;
  method?: string;
  reference?: string | null;
  prayer?: string | null;
  share?: boolean;
  authorized?: boolean;
};

async function donate(
  user: string,
  d: NewDonation = {},
): Promise<{ id: string; created: boolean }> {
  const rows = await q<{ r: { id: string; created: boolean } }>(
    user,
    `select create_donation($1, $2, $3, $4::date, $5, $6::donation_type, $7::donation_payment_method, $8, $9, $10, $11) as r`,
    [
      d.key ?? randomUUID(),
      d.anonymous ? null : "person" in d ? d.person : donorId,
      d.anonymous ?? false,
      d.date ?? "2026-03-15",
      d.cents ?? 1000,
      d.type ?? "diezmo",
      d.method ?? "efectivo",
      d.reference ?? null,
      d.prayer ?? null,
      d.share ?? false,
      d.authorized ?? false,
    ],
  );
  return rows[0]!.r;
}

async function totals(user: string, from: string, to: string, person: string | null = null) {
  const rows = await q<{ t: Json }>(
    user,
    `select finance_donation_totals($1::date, $2::date, $3) as t`,
    [from, to, person],
  );
  return rows[0]!.t;
}

before(async () => {
  db = await createTestDb();
  apostol = await createUser(db, "apostol");
  finanzas = await createUser(db, "finanzas");
  admin = await createUser(db, "admin-fin", ["administrador"]);
  pastor = await createUser(db, "pastor-fin", ["pastor"]);
  ujier = await createUser(db, "ujier-fin", ["ujier"]);
  miembro = await createUser(db, "miembro-fin");
  intercesor = await createUser(db, "intercesor-fin", ["intercesor"]);
  // Alta inicial explícita (como en el SQL Editor, rol postgres).
  await db.query(`select bootstrap_first_apostol($1, 'Prueba: alta inicial sintética')`, [apostol]);
  await q(apostol, `select apostol_set_financial_role($1, 'finanzas', true, 'Tesorería')`, [
    finanzas,
  ]);
  donorId = (
    await db.query<{ id: string }>(
      `insert into people (first_name, last_name, phone) values ('Donante', 'Sincuenta', '787-555-0101') returning id`,
    )
  ).rows[0]!.id;
  donor2Id = (
    await db.query<{ id: string }>(
      `insert into people (first_name, last_name) values ('Otra', 'Donante') returning id`,
    )
  ).rows[0]!.id;
});

after(async () => {
  await db?.close();
});

describe("asignación de privilegios financieros", () => {
  test("el alta inicial solo se hace una vez y no desde la app", async () => {
    await rejects(
      () => db.query(`select bootstrap_first_apostol($1, 'Segundo intento')`, [admin]),
      /Ya existe un Apóstol/,
    );
    for (const u of [admin, apostol, finanzas]) {
      await rejects(
        () => q(u, `select bootstrap_first_apostol($1, 'Autoasignación')`, [u]),
        /permission denied/,
      );
    }
  });

  test("un administrador no puede asignarse ni asignar Apóstol o Finanzas", async () => {
    const adminPerson = await personOf(db, admin);
    await rejects(
      () =>
        q(
          admin,
          `select admin_set_person_roles($1, '{administrador,miembro}', '{administrador,miembro,finanzas}')`,
          [adminPerson],
        ),
      /solo los gestiona un Apóstol/,
    );
    await rejects(
      () =>
        q(
          admin,
          `select admin_set_person_roles($1, '{administrador,miembro}', '{administrador,miembro,apostol}')`,
          [adminPerson],
        ),
      /solo los gestiona un Apóstol/,
    );
    await rejects(
      () => q(admin, `select apostol_set_financial_role($1, 'finanzas', true)`, [admin]),
      /No autorizado/,
    );
    // Escritura directa: sin política RLS y además el trigger.
    await rejects(
      () => q(admin, `insert into user_roles (user_id, role) values ($1, 'finanzas')`, [admin]),
      /row-level security|solo los gestiona/,
    );
    await rejects(
      () => db.query(`insert into user_roles (user_id, role) values ($1, 'finanzas')`, [admin]),
      /solo los gestiona un Apóstol/,
    );
  });

  test("finanzas no puede conceder finanzas ni apostol", async () => {
    await rejects(
      () => q(finanzas, `select apostol_set_financial_role($1, 'finanzas', true)`, [pastor]),
      /No autorizado/,
    );
  });

  test("el admin sigue gestionando los demás roles sin tocar los financieros", async () => {
    const pid = await personOf(db, finanzas);
    await q(admin, `select admin_set_person_roles($1, '{miembro}', '{miembro,maestro}')`, [pid]);
    const roles = (
      await db.query<{ role: string }>(
        `select role from user_roles where user_id = $1 order by role`,
        [finanzas],
      )
    ).rows.map((r) => r.role);
    assert.deepEqual(roles.sort(), ["finanzas", "maestro", "miembro"]);
  });

  test("no se puede quitar el último Apóstol; concesiones auditadas", async () => {
    await rejects(
      () => q(apostol, `select apostol_set_financial_role($1, 'apostol', false)`, [apostol]),
      /última cuenta/,
    );
    const audit = await db.query<{ action: string; actor_user_id: string }>(
      `select action, actor_user_id from audit_log where action in ('grant_financial_role', 'bootstrap_first_apostol') order by created_at`,
    );
    assert.deepEqual(
      audit.rows.map((r) => r.action),
      ["bootstrap_first_apostol", "grant_financial_role"],
    );
    assert.equal(audit.rows[1]!.actor_user_id, apostol);
  });
});

describe("borrado de cuentas", () => {
  test("borrar una cuenta con Finanzas funciona; la del último Apóstol no", async () => {
    const tmp = await createUser(db, "fin-borrable");
    await q(apostol, `select apostol_set_financial_role($1, 'finanzas', true)`, [tmp]);
    await db.query(`delete from auth.users where id = $1`, [tmp]);
    assert.equal(
      (await db.query(`select 1 from user_roles where user_id = $1`, [tmp])).rows.length,
      0,
    );
    await rejects(
      () => db.query(`delete from auth.users where id = $1`, [apostol]),
      /última cuenta/,
    );
  });
});

describe("registro de donaciones", () => {
  test("cada tipo y forma de pago; donante sin cuenta", async () => {
    for (const type of ALL_TYPES) {
      for (const method of ALL_METHODS) {
        const r = await donate(finanzas, { type, method, date: "2025-06-01", cents: 1 });
        assert.equal(r.created, true);
      }
    }
    const t = await totals(finanzas, "2025-06-01", "2025-06-01");
    assert.equal(t.count, 24);
    assert.equal(t.total_cents, 24);
    assert.equal((t.by_type as Json[]).length, 4);
    assert.equal((t.by_method as Json[]).length, 6);
  });

  test("anónimas cuentan en totales generales, separadas de identificadas", async () => {
    await donate(finanzas, { anonymous: true, cents: 5000, date: "2025-07-04" });
    await donate(apostol, { cents: 2500, date: "2025-07-04" });
    const t = await totals(finanzas, "2025-07-04", "2025-07-04");
    assert.deepEqual(
      [t.total_cents, t.identified_cents, t.anonymous_cents, t.anonymous_count],
      [7500, 2500, 5000, 1],
    );
    await rejects(() => donate(finanzas, { anonymous: false, person: null }), /Elige una persona/);
  });

  test("validación de montos, fechas y referencias", async () => {
    await rejects(() => donate(finanzas, { cents: 0 }), /mayor que \$0\.00/);
    await rejects(() => donate(finanzas, { cents: -5 }), /mayor que/);
    await rejects(() => donate(finanzas, { date: "2099-01-01" }), /futura/);
    await rejects(() => donate(finanzas, { reference: "4111 1111 1111 1111" }), /tarjeta/);
    const ok = await donate(finanzas, { reference: "Cheque 1042" });
    assert.equal(ok.created, true);
  });

  test("doble clic / reintento no duplica; aportaciones iguales legítimas sí se permiten", async () => {
    const key = randomUUID();
    const a = await donate(finanzas, { key, cents: 777, date: "2025-08-08" });
    const b = await donate(finanzas, { key, cents: 777, date: "2025-08-08" });
    assert.equal(a.id, b.id);
    assert.equal(b.created, false);
    const c = await donate(finanzas, { cents: 777, date: "2025-08-08" });
    assert.notEqual(c.id, a.id);
    assert.equal((await totals(finanzas, "2025-08-08", "2025-08-08")).count, 2);
  });

  test("centavos exactos (sin errores de punto flotante)", async () => {
    // 0.1 + 0.2 en float = 0.30000000000000004
    await donate(finanzas, { cents: 10, date: "2025-09-09" });
    await donate(finanzas, { cents: 20, date: "2025-09-09" });
    for (let i = 0; i < 100; i++) await donate(finanzas, { cents: 1, date: "2025-09-10" });
    assert.equal((await totals(finanzas, "2025-09-09", "2025-09-09")).total_cents, 30);
    assert.equal((await totals(finanzas, "2025-09-10", "2025-09-10")).total_cents, 100);
  });

  test("totales abarcan todo el filtro, no la página", async () => {
    const page = await q<{ total_count: string }>(
      finanzas,
      `select * from finance_list_donations('2025-09-10', '2025-09-10', null, null, null, null, null, 10, 0)`,
    );
    assert.equal(page.length, 10);
    assert.equal(Number(page[0]!.total_count), 100);
    assert.equal((await totals(finanzas, "2025-09-10", "2025-09-10")).total_cents, 100);
  });

  test("límites de período por fecha local (31 dic entra, 1 ene no)", async () => {
    await donate(finanzas, { person: donor2Id, cents: 100, date: "2024-12-31" });
    await donate(finanzas, { person: donor2Id, cents: 200, date: "2025-01-01" });
    assert.equal((await totals(finanzas, "2024-01-01", "2024-12-31", donor2Id)).total_cents, 100);
    assert.equal((await totals(finanzas, "2025-01-01", "2025-12-31", donor2Id)).total_cents, 200);
  });
});

describe("aislamiento de permisos", () => {
  test("administrador, pastor, ujier, miembro e intercesor no ven nada financiero", async () => {
    for (const u of [admin, pastor, ujier, miembro, intercesor]) {
      assert.equal((await q(u, `select id from donations`)).length, 0);
      assert.equal((await q(u, `select id from donation_revisions`)).length, 0);
      assert.equal((await q(u, `select id from finance_settings`)).length, 0);
      assert.equal((await q(u, `select id from donation_letters`)).length, 0);
      await rejects(() => q(u, `select finance_donation_totals()`), /No autorizado/);
      await rejects(() => q(u, `select * from finance_list_donations()`), /No autorizado/);
      await rejects(() => q(u, `select * from finance_search_people('Donante')`), /No autorizado/);
      await rejects(
        () => q(u, `select * from finance_donor_yearly($1)`, [donorId]),
        /No autorizado/,
      );
      await rejects(() => donate(u), /No autorizado/);
    }
  });

  test("la auditoría general (admin) no contiene montos", async () => {
    const rows = await q<{ metadata: Json }>(admin, `select metadata from audit_log`);
    assert.ok(!JSON.stringify(rows).includes("amount_cents"));
  });

  test("la revocación corta el acceso de inmediato", async () => {
    const tmp = await createUser(db, "fin-temporal");
    await q(apostol, `select apostol_set_financial_role($1, 'finanzas', true)`, [tmp]);
    assert.ok((await q(tmp, `select id from donations limit 1`)).length === 1);
    await q(
      apostol,
      `select apostol_set_financial_role($1, 'finanzas', false, 'Fin de servicio')`,
      [tmp],
    );
    assert.equal((await q(tmp, `select id from donations`)).length, 0);
    await rejects(() => donate(tmp), /No autorizado/);
  });
});

describe("petición de oración del sobre", () => {
  test("vacía no impide registrar; con texto queda separada y auditada", async () => {
    const empty = await donate(finanzas, { prayer: "   " });
    assert.equal(empty.created, true);
    assert.equal(
      (await db.query(`select 1 from donation_prayer_notes where donation_id = $1`, [empty.id]))
        .rows.length,
      0,
    );

    const secret = "Oren por la salud de mi madre (sintético)";
    const r = await donate(finanzas, { prayer: secret, cents: 4242, date: "2025-10-01" });
    // Nadie la lee directo, ni finanzas.
    for (const u of [finanzas, apostol, admin, intercesor]) {
      assert.equal((await q(u, `select * from donation_prayer_notes`)).length, 0);
    }
    const read = await q<{ content: string }>(
      finanzas,
      `select * from read_donation_prayer_note($1)`,
      [r.id],
    );
    assert.equal(read[0]!.content, secret);
    const log = await db.query(`select action from donation_prayer_note_access_log`);
    assert.equal(log.rows.length, 1);
    await rejects(
      () => q(intercesor, `select * from read_donation_prayer_note($1)`, [r.id]),
      /No autorizado/,
    );

    // No aparece en listados, totales, revisiones, detalle ni auditorías.
    const list = await q(
      finanzas,
      `select * from finance_list_donations('2025-10-01', '2025-10-01')`,
    );
    const detail = await q(finanzas, `select finance_get_donation($1) as d`, [r.id]);
    const revs = await db.query(`select * from donation_revisions where donation_id = $1`, [r.id]);
    const audits = await db.query(
      `select * from audit_log union all select * from finance_audit_log`,
    );
    for (const blob of [list, detail, revs.rows, audits.rows]) {
      assert.ok(!JSON.stringify(blob).includes("salud de mi madre"));
    }
  });

  test("finanzas no abre la bandeja de oración (SuperAdmin sí, desde 0036)", async () => {
    await db.query(`insert into prayer_requests (content) values ('Petición general sintética')`);
    assert.equal((await q(finanzas, `select id from prayer_requests`)).length, 0);
    assert.ok((await q(apostol, `select id from prayer_requests`)).length > 0);
  });

  test("SuperAdmin (apostol) tiene todos los permisos; admin sigue sin finanzas", async () => {
    const checks = await q<Json>(
      apostol,
      `select is_admin() a, is_staff() s, is_prayer_reader() p, can_record_attendance() r,
              can_manage_services() m, can_control_checkin() c, can_correct_attendance() x,
              has_finance_access() f`,
    );
    assert.deepEqual(Object.values(checks[0]!), [true, true, true, true, true, true, true, true]);
    assert.ok((await q(apostol, `select * from list_users_with_roles()`)).length > 0);
    const adminChecks = await q<Json>(admin, `select has_finance_access() f, is_apostol() a`);
    assert.deepEqual(adminChecks[0], { f: false, a: false });
    const finChecks = await q<Json>(finanzas, `select is_admin() a, is_prayer_reader() p`);
    assert.deepEqual(finChecks[0], { a: false, p: false });
  });

  test("compartir con intercesión exige autorización registrada y no duplica", async () => {
    await rejects(
      () => donate(finanzas, { prayer: "Petición A", share: true, authorized: false }),
      /autorizó/,
    );
    const key = randomUUID();
    const r = await donate(finanzas, {
      key,
      prayer: "Petición compartida",
      share: true,
      authorized: true,
      cents: 9999,
    });
    await donate(finanzas, {
      key,
      prayer: "Petición compartida",
      share: true,
      authorized: true,
      cents: 9999,
    });
    const again = await q<{ s: string }>(
      finanzas,
      `select share_donation_prayer_note($1, true) as s`,
      [r.id],
    );
    assert.equal(again[0]!.s, "ya_compartida");

    const shared = await q<Json>(
      intercesor,
      `select * from prayer_requests where content = 'Petición compartida'`,
    );
    assert.equal(shared.length, 1, "una sola petición pese a reintentos");
    assert.equal(shared[0]!.requester_person_id, donorId);
    assert.equal(shared[0]!.submitted_by_user_id, null);
    assert.ok(!JSON.stringify(shared).includes("9999"));
    const note = await db.query<Json>(
      `select share_authorized_by from donation_prayer_notes where donation_id = $1`,
      [r.id],
    );
    assert.equal(note.rows[0]!.share_authorized_by, finanzas);

    // Compartir después exige confirmación.
    const later = await donate(finanzas, { prayer: "Petición posterior" });
    await rejects(
      () => q(finanzas, `select share_donation_prayer_note($1, false)`, [later.id]),
      /autorizó/,
    );
  });
});

describe("correcciones, anulaciones y cartas", () => {
  test("corrección y anulación con motivo, versión y revisiones inmutables", async () => {
    const r = await donate(finanzas, { cents: 1500, date: "2025-11-01" });
    await rejects(
      () =>
        q(
          finanzas,
          `select correct_donation($1, 1, $2, false, '2025-11-01', 1600, 'diezmo', 'efectivo', null, '')`,
          [r.id, donorId],
        ),
      /motivo/,
    );
    const v = await q<{ v: number }>(
      finanzas,
      `select correct_donation($1, 1, $2, false, '2025-11-01', 1600, 'diezmo', 'efectivo', null, 'Error de conteo') as v`,
      [r.id, donorId],
    );
    assert.equal(v[0]!.v, 2);
    // Edición simultánea con versión vieja: rechazada.
    await rejects(
      () =>
        q(
          apostol,
          `select correct_donation($1, 1, $2, false, '2025-11-01', 1700, 'diezmo', 'efectivo', null, 'Otra corrección')`,
          [r.id, donorId],
        ),
      /Otra persona modificó/,
    );
    await q(finanzas, `select void_donation($1, 2, 'Cheque devuelto')`, [r.id]);
    const revs = await db.query<{ action: string; before: Json; reason: string }>(
      `select action, before, reason from donation_revisions where donation_id = $1 order by revision`,
      [r.id],
    );
    assert.deepEqual(
      revs.rows.map((x) => x.action),
      ["creada", "corregida", "anulada"],
    );
    assert.equal(revs.rows[1]!.before.amount_cents, 1500);
    assert.equal((await totals(finanzas, "2025-11-01", "2025-11-01")).total_cents, 0);
    await rejects(
      () => db.query(`update donation_revisions set reason = 'x' where donation_id = $1`, [r.id]),
      /no se puede modificar/,
    );
    await rejects(
      () => db.query(`delete from donations where id = $1`, [r.id]),
      /no se puede modificar/,
    );
  });

  test("carta: total exacto sin anónimas, anuladas ni fuera de período; versiones y revisión", async () => {
    const letterPerson = (
      await db.query<{ id: string }>(
        `insert into people (first_name, last_name) values ('Carta', 'Prueba') returning id`,
      )
    ).rows[0]!.id;
    await donate(finanzas, { person: letterPerson, cents: 12345, date: "2024-01-01" });
    await donate(finanzas, { person: letterPerson, cents: 55, date: "2024-12-31" });
    await donate(finanzas, { person: letterPerson, cents: 99999, date: "2025-01-01" });
    await donate(finanzas, { anonymous: true, cents: 88888, date: "2024-05-05" });
    const voided = await donate(finanzas, {
      person: letterPerson,
      cents: 7777,
      date: "2024-06-06",
    });
    await q(finanzas, `select void_donation($1, 1, 'Duplicado en papel')`, [voided.id]);

    const data = (
      await q<{ d: Json }>(
        finanzas,
        `select finance_letter_data($1, '2024-01-01', '2024-12-31') as d`,
        [letterPerson],
      )
    )[0]!.d;
    assert.equal(data.total_cents, 12400);
    assert.equal(data.donation_count, 2);
    assert.equal(data.next_version, 1);

    const pdf = Buffer.from("%PDF-1.7 prueba sintética " + "x".repeat(200)).toString("base64");
    const issue = (id: string, version: number, total = 12400) =>
      q<{ r: Json }>(
        finanzas,
        `select issue_donation_letter($1, $2, '2024-01-01', '2024-12-31', $3, 2, $4, $5, $6::jsonb, $7) as r`,
        [
          id,
          letterPerson,
          total,
          version,
          `CDA-2024-${id.slice(0, 8)}-v${version}`,
          JSON.stringify({ total_cents: total }),
          pdf,
        ],
      );
    const id1 = randomUUID();
    await issue(id1, 1);
    const dup = await issue(id1, 1);
    assert.equal(dup[0]!.r.created, false, "doble clic no emite otra");
    await rejects(() => issue(randomUUID(), 2, 99999), /cambiaron/);

    // Una corrección posterior NO cambia la carta; la marca para revisión.
    const later = await donate(finanzas, { person: letterPerson, cents: 100, date: "2024-07-07" });
    let letters = await q<{ status: string; total_cents: string; version: number }>(
      finanzas,
      `select * from list_donation_letters($1)`,
      [letterPerson],
    );
    assert.equal(letters[0]!.status, "requiere_revision");
    assert.equal(Number(letters[0]!.total_cents), 12400);

    const id2 = randomUUID();
    await issue(id2, 2, 12500).catch(() => undefined); // count cambió a 3 → rechaza
    const data2 = (
      await q<{ d: Json }>(
        finanzas,
        `select finance_letter_data($1, '2024-01-01', '2024-12-31') as d`,
        [letterPerson],
      )
    )[0]!.d;
    assert.equal(data2.total_cents, 12500);
    await q(
      finanzas,
      `select issue_donation_letter($1, $2, '2024-01-01', '2024-12-31', 12500, 3, 2, $3, '{"total_cents":12500}'::jsonb, $4)`,
      [id2, letterPerson, `CDA-2024-${id2.slice(0, 8)}-v2`, pdf],
    );
    letters = await q(finanzas, `select * from list_donation_letters($1) order by version`, [
      letterPerson,
    ]);
    assert.deepEqual(
      letters.map((l) => [l.version, l.status]),
      [
        [1, "reemplazada"],
        [2, "vigente"],
      ],
    );

    // La versión 1 conserva su PDF exacto.
    const v1 = await q<{ pdf_base64: string }>(
      finanzas,
      `select * from get_donation_letter_pdf($1)`,
      [id1],
    );
    assert.equal(v1[0]!.pdf_base64, pdf);
    void later;

    for (const u of [admin, pastor, intercesor, miembro]) {
      await rejects(
        () => q(u, `select * from get_donation_letter_pdf($1)`, [id1]),
        /No autorizado/,
      );
      await rejects(() => q(u, `select * from list_donation_letters()`), /No autorizado/);
    }
  });

  test("configuración: finanzas edita datos, solo Apóstol aprueba la plantilla", async () => {
    const args = `'Ciudad de Avivamiento', null, null, null, null, 'Secretario de Hacienda', 'Texto {donante}', 'Atentamente,', null, null`;
    await q(finanzas, `select finance_update_settings(${args}, 'borrador')`);
    await rejects(
      () => q(finanzas, `select finance_update_settings(${args}, 'aprobada')`),
      /No autorizado/,
    );
    await q(apostol, `select finance_update_settings(${args}, 'aprobada')`);
    await rejects(
      () => q(admin, `select finance_update_settings(${args}, 'borrador')`),
      /No autorizado/,
    );
  });
});
