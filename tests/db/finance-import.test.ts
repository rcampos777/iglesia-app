/**
 * Donantes de Finanzas e importación de donaciones (0053) contra un
 * Postgres aislado en memoria. Datos 100 % sintéticos.   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

type Json = Record<string, unknown>;
let db: PGlite;
let apostol: string;
let finanzas: string;
let admin: string;
let seguimiento: string;
let miembroPerson: string; // persona del directorio con cuenta (Marta Gómez)
let directoryPerson: string; // persona del directorio sin cuenta

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

async function q<T = Json>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
}

type Row = {
  row_number: number;
  donor_name?: string;
  family?: string;
  donation_date?: string | null;
  amount_cents?: number | null;
  raw_type?: string;
  donation_type?: string | null;
  raw_method?: string;
  payment_method?: string | null;
  reference?: string;
  errors?: string[];
};

function row(r: Row) {
  return {
    raw: {},
    donation_date: "2026-03-01",
    amount_cents: 1000,
    raw_type: "Diezmo",
    donation_type: "diezmo",
    raw_method: "Efectivo",
    payment_method: "efectivo",
    errors: [],
    ...r,
  };
}

async function createBatch(user: string, rows: Row[], name = "prueba.xlsx"): Promise<string> {
  const res = await q<{ id: string }>(user, `select finance_import_create_batch($1, $2) as id`, [
    name,
    JSON.stringify(rows.map(row)),
  ]);
  return res[0]!.id;
}

type Donor = {
  id: string;
  display_name: string;
  row_count: number;
  total_cents: string;
  decision: string;
  suggested_person_id: string | null;
  suggest_anonymous: boolean;
  candidates: { id: string; name: string; finance_only: boolean }[];
  similar: { id: string; name: string }[];
};

async function donors(batch: string): Promise<Donor[]> {
  return q<Donor>(finanzas, `select * from finance_import_donor_list($1)`, [batch]);
}

function byName(list: Donor[], name: string): Donor {
  const d = list.find((x) => x.display_name === name);
  assert.ok(d, `no se encontró el donante ${name}`);
  return d;
}

async function promoteAll(batch: string): Promise<Json> {
  let last: Json = {};
  for (let i = 0; i < 20; i++) {
    last = (
      await q<{ r: Json }>(finanzas, `select finance_import_promote($1, 2) as r`, [batch])
    )[0]!.r;
    if (Number(last.remaining) === 0) break;
  }
  return last;
}

before(async () => {
  db = await createTestDb();
  apostol = await createUser(db, "apostol-imp");
  finanzas = await createUser(db, "finanzas-imp");
  admin = await createUser(db, "admin-imp", ["administrador"]);
  seguimiento = await createUser(db, "seguimiento-imp", ["seguimiento"]);
  const miembro = await createUser(db, "miembro-imp");
  miembroPerson = await personOf(db, miembro);
  await db.query(`update people set first_name = 'Marta', last_name = 'Gómez' where id = $1`, [
    miembroPerson,
  ]);
  await db.query(`select bootstrap_first_apostol($1, 'Prueba: alta inicial sintética')`, [apostol]);
  await q(apostol, `select apostol_set_financial_role($1, 'finanzas', true, 'Tesorería')`, [
    finanzas,
  ]);
  directoryPerson = (
    await db.query<{ id: string }>(
      `insert into people (first_name, last_name, phone)
       values ('Ana Lucía', 'Pérez Ríos', '787-555-0199') returning id`,
    )
  ).rows[0]!.id;
});

after(async () => {
  await db?.close();
});

describe("donantes solo de Finanzas", () => {
  let donor: string;

  test("Finanzas crea un donante; si el nombre ya existe pide confirmar", async () => {
    await rejects(
      () => q(finanzas, `select finance_create_donor('ana lucia', 'perez rios')`),
      /MISMO_NOMBRE/,
    );
    donor = (
      await q<{ id: string }>(finanzas, `select finance_create_donor('Bruno', 'Quiñones') as id`)
    )[0]!.id;
    const again = await q<{ id: string }>(
      finanzas,
      `select finance_create_donor('Bruno', 'Quiñones', true) as id`,
    );
    assert.notEqual(again[0]!.id, donor);
  });

  test("solo Finanzas/Apóstol pueden crear donantes", async () => {
    for (const u of [admin, seguimiento]) {
      await rejects(() => q(u, `select finance_create_donor('X', 'Y')`), /No autorizado/);
    }
  });

  test("no aparece en el directorio para nadie (ni admin ni SuperAdmin)", async () => {
    for (const u of [admin, seguimiento, apostol, finanzas]) {
      const rows = await q(u, `select id from people where id = $1`, [donor]);
      assert.equal(rows.length, 0, `visible para ${u}`);
    }
    const all = await q<{ n: string }>(
      admin,
      `select count(*) as n from people where finance_only`,
    );
    assert.equal(Number(all[0]!.n), 0);
    await q(admin, `update people set notes = 'x' where id = $1`, [donor]);
    const notes = await db.query<{ notes: string | null }>(
      `select notes from people where id = $1`,
      [donor],
    );
    assert.equal(notes.rows[0]!.notes, null);
  });

  test("nadie inserta un donante oculto por la API directa", async () => {
    await rejects(
      () =>
        q(
          admin,
          `insert into people (first_name, last_name, finance_only) values ('A', 'B', true)`,
        ),
      /row-level security/,
    );
  });

  test("los selectores internos no lo listan", async () => {
    const picker = await q<{ id: string }>(
      admin,
      `select id from list_people_for_ministry_picker()`,
    );
    assert.ok(!picker.some((p) => p.id === donor));
    assert.ok(picker.some((p) => p.id === directoryPerson));
  });

  test("Finanzas lo encuentra (sin acentos) marcado como donante", async () => {
    const res = await q<{ person_id: string; hint: string | null }>(
      finanzas,
      `select * from finance_search_people('bruno quinones')`,
    );
    const hit = res.find((r) => r.person_id === donor);
    assert.equal(hit?.hint, "Donante (solo Finanzas)");
    const info = await q<{ finance_only: boolean; has_account: boolean }>(
      finanzas,
      `select * from finance_person_info($1)`,
      [donor],
    );
    assert.deepEqual(info[0], {
      display_name: "Bruno Quiñones",
      finance_only: true,
      has_account: false,
    });
  });
});

describe("importación de donaciones", () => {
  let batch: string;

  test("solo Finanzas crea lotes y lee el staging", async () => {
    for (const u of [admin, seguimiento]) {
      await rejects(() => createBatch(u, [{ row_number: 2, donor_name: "X Y" }]), /No autorizado/);
    }
    batch = await createBatch(finanzas, [
      // Mismo donante escrito distinto → un solo donante
      { row_number: 2, donor_name: "Ana Lucía Pérez Ríos", amount_cents: 5000 },
      { row_number: 3, donor_name: "  ana lucia   PEREZ rios ", amount_cents: 2500 },
      // Directorio por coincidencia parcial (todas sus palabras)
      { row_number: 4, donor_name: "Marta Gómez Luna" },
      // Sin coincidencia
      { row_number: 5, donor_name: "Carmen Ortiz" },
      // Parecido dentro del mismo archivo
      { row_number: 6, donor_name: "Carmen Ortiz Vega", amount_cents: 700 },
      { row_number: 7, donor_name: "Diego Soto", raw_type: "Pacto", donation_type: "pacto" },
      // Anónimas
      { row_number: 8, donor_name: "", family: "", amount_cents: 300 },
      { row_number: 9, donor_name: "Anónimo", amount_cents: 200 },
      // Valores sin reconocer y errores
      { row_number: 10, donor_name: "Diego Soto", raw_method: "Débito", payment_method: null },
      { row_number: 11, donor_name: "Diego Soto", donation_date: "2099-01-01" },
      { row_number: 12, donor_name: "Diego Soto", reference: "4111 1111 1111 1111" },
      { row_number: 13, donor_name: "Diego Soto", amount_cents: null, errors: ["Monto inválido."] },
      // Familia/Grupo cuando no hay nombre
      { row_number: 14, donor_name: "", family: "Familia Soto" },
    ]);
    for (const u of [admin, seguimiento]) {
      const rows = await q(u, `select id from donation_import_rows where batch_id = $1`, [batch]);
      assert.equal(rows.length, 0);
      await rejects(
        () => q(u, `select * from finance_import_donor_list($1)`, [batch]),
        /No autorizado/,
      );
    }
    // Sin política de escritura: ni Finanzas cambia el staging por la API directa.
    await q(finanzas, `update donation_import_donors set decision = 'omitir'`);
    assert.ok((await donors(batch)).every((x) => x.decision === "pendiente"));
  });

  test("agrupa por nombre y sugiere sin decidir", async () => {
    const list = await donors(batch);
    assert.equal(list.length, 8);
    const ana = byName(list, "Ana Lucía Pérez Ríos");
    assert.equal(ana.row_count, 2);
    assert.equal(Number(ana.total_cents), 7500);
    assert.equal(ana.suggested_person_id, directoryPerson);
    assert.equal(ana.decision, "pendiente");

    // Parecido pero no idéntico: candidata, nunca sugerida para enlace automático.
    const marta = byName(list, "Marta Gómez Luna");
    assert.deepEqual(
      marta.candidates.map((c) => c.id),
      [miembroPerson],
    );
    assert.equal(marta.suggested_person_id, null);

    const carmen = byName(list, "Carmen Ortiz");
    assert.equal(carmen.candidates.length, 0);
    assert.deepEqual(
      carmen.similar.map((s) => s.name),
      ["Carmen Ortiz Vega"],
    );
    assert.ok(byName(list, "Sin nombre").suggest_anonymous);
    assert.ok(byName(list, "Anónimo").suggest_anonymous);
    assert.ok(byName(list, "Familia Soto"));

    const errs = await q<{ row_number: number; errors: string[]; status: string }>(
      finanzas,
      `select row_number, errors, status from donation_import_rows
        where batch_id = $1 and cardinality(errors) > 0 order by row_number`,
      [batch],
    );
    assert.deepEqual(
      errs.map((e) => [e.row_number, e.status]),
      [
        [11, "omitida"],
        [12, "omitida"],
        [13, "omitida"],
      ],
    );
    const unmapped = await q<{ field: string; raw_value: string; row_count: string }>(
      finanzas,
      `select * from finance_import_unmapped($1)`,
      [batch],
    );
    assert.deepEqual(
      unmapped.map((u) => [u.field, u.raw_value, Number(u.row_count)]),
      [["forma", "Débito", 1]],
    );
  });

  test("no importa con donantes o valores pendientes", async () => {
    await rejects(() => promoteAll(batch), /PENDIENTE: Faltan donantes/);
    await q(finanzas, `select finance_import_bulk_decide($1, 'sugerencias')`, [batch]);
    const n = await q<{ n: number }>(
      finanzas,
      `select finance_import_bulk_decide($1, 'crear_sin_coincidencia') as n`,
      [batch],
    );
    // Diego Soto y Familia Soto (Carmen tiene parecidos → revisión manual)
    assert.equal(n[0]!.n, 2);
    const list = await donors(batch);
    const carmen = byName(list, "Carmen Ortiz");
    const carmenVega = byName(list, "Carmen Ortiz Vega");
    await q(finanzas, `select finance_import_decide($1, 'crear', null, 'Carmen', 'Ortiz Vega')`, [
      carmenVega.id,
    ]);
    await q(finanzas, `select finance_import_decide($1, 'unir', null, null, null, $2)`, [
      carmen.id,
      carmenVega.id,
    ]);
    // No se puede unir en cadena ni unir el principal a otro
    await rejects(
      () =>
        q(finanzas, `select finance_import_decide($1, 'unir', null, null, null, $2)`, [
          carmenVega.id,
          byName(list, "Diego Soto").id,
        ]),
      /Otros donantes están unidos a este/,
    );
    await rejects(() => promoteAll(batch), /Faltan donantes por decidir/);
    await q(finanzas, `select finance_import_decide($1, 'enlazar', $2)`, [
      byName(list, "Marta Gómez Luna").id,
      miembroPerson,
    ]);
    await rejects(() => promoteAll(batch), /Categoría o Forma de pago sin asignar/);
    await q(finanzas, `select finance_import_map_value($1, 'forma', 'débito', 'ath')`, [batch]);
  });

  test("importa: enlaza, crea donantes ocultos, une y respeta anónimas", async () => {
    const res = await promoteAll(batch);
    assert.equal(res.remaining, 0);
    const summary = (
      await q<{ s: Json }>(finanzas, `select finance_import_summary($1) as s`, [batch])
    )[0]!.s;
    assert.equal(summary.imported, 10);
    assert.equal(summary.skipped, 3);

    const b = await q<{ status: string; imported_count: number }>(
      finanzas,
      `select status, imported_count from donation_import_batches where id = $1`,
      [batch],
    );
    assert.deepEqual(b[0], { status: "completado", imported_count: 10 });

    const anaD = await q<{ n: string }>(
      finanzas,
      `select count(*) as n from donations where person_id = $1`,
      [directoryPerson],
    );
    assert.equal(Number(anaD[0]!.n), 2);

    const list = await donors(batch);
    const carmenVega = await q<{ person_id: string }>(
      finanzas,
      `select person_id from donation_import_donors where id = $1`,
      [byName(list, "Carmen Ortiz Vega").id],
    );
    const carmenPerson = carmenVega[0]!.person_id;
    const carmenDonations = await q<{ n: string }>(
      finanzas,
      `select count(*) as n from donations where person_id = $1`,
      [carmenPerson],
    );
    assert.equal(Number(carmenDonations[0]!.n), 2);
    const hidden = await db.query<{ finance_only: boolean; source: string }>(
      `select finance_only, source::text from people where id = $1`,
      [carmenPerson],
    );
    assert.deepEqual(hidden.rows[0], { finance_only: true, source: "finanzas" });
    assert.equal((await q(admin, `select 1 from people where id = $1`, [carmenPerson])).length, 0);

    const anon = await q<{ n: string }>(
      finanzas,
      `select count(*) as n from donations d join donation_import_rows r on r.donation_id = d.id
        where r.batch_id = $1 and d.is_anonymous`,
      [batch],
    );
    assert.equal(Number(anon[0]!.n), 2);

    const pacto = await q<{ n: string }>(
      finanzas,
      `select count(*) as n from donations where donation_type = 'pacto'`,
    );
    assert.equal(Number(pacto[0]!.n), 1);

    // Reintentar no duplica (idempotencia por fila).
    await rejects(() => promoteAll(batch), /ya no está en revisión/);
  });

  test("el siguiente archivo reconoce los mismos donantes y detecta repetidas", async () => {
    const batch2 = await createBatch(finanzas, [
      { row_number: 2, donor_name: "Carmen Ortiz Vega", amount_cents: 700 }, // ya importada
      { row_number: 3, donor_name: "Carmen Ortiz Vega", amount_cents: 900 },
    ]);
    const list = await donors(batch2);
    assert.equal(list.length, 1);
    const prior = await q<{ person_id: string }>(
      finanzas,
      `select person_id from donation_import_donors where match_key = 'carmen ortiz vega' and batch_id <> $1`,
      [batch2],
    );
    assert.equal(list[0]!.suggested_person_id, prior[0]!.person_id);
    await q(finanzas, `select finance_import_bulk_decide($1, 'sugerencias')`, [batch2]);
    const res = await promoteAll(batch2);
    assert.equal(res.review, 1);
    const st = await q<{ status: string }>(
      finanzas,
      `select status from donation_import_batches where id = $1`,
      [batch2],
    );
    assert.equal(st[0]!.status, "en_revision");
    await q(finanzas, `select finance_import_resolve_repeats($1, null, false)`, [batch2]);
    const st2 = await q<{ status: string }>(
      finanzas,
      `select status from donation_import_batches where id = $1`,
      [batch2],
    );
    assert.equal(st2[0]!.status, "completado");
  });

  test("descartar solo si no se importó nada", async () => {
    const b = await createBatch(finanzas, [{ row_number: 2, donor_name: "Zoe Zeta" }]);
    await q(finanzas, `select finance_import_discard($1)`, [b]);
    await rejects(
      () => q(finanzas, `select finance_import_bulk_decide($1, 'sugerencias')`, [b]),
      /ya no está en revisión/,
    );
  });
});

describe("vincular donante con la persona real", () => {
  test("sugiere el vínculo y mueve donaciones, cartas e historial", async () => {
    const donor = (
      await q<{ id: string }>(finanzas, `select finance_create_donor('Elena', 'Vargas') as id`)
    )[0]!.id;
    await q(
      finanzas,
      `select create_donation(gen_random_uuid(), $1, false, '2026-02-01', 2000, 'ofrenda', 'ath')`,
      [donor],
    );
    // Más tarde la persona se registra en la app (persona nueva del directorio).
    const elena = await createUser(db, "elena");
    const elenaPerson = await personOf(db, elena);
    await db.query(`update people set first_name = 'Elena', last_name = 'Vargas' where id = $1`, [
      elenaPerson,
    ]);

    const sugg = await q<{ donor_id: string; person_id: string; has_account: boolean }>(
      finanzas,
      `select * from finance_donor_link_suggestions()`,
    );
    const s = sugg.find((x) => x.donor_id === donor);
    assert.equal(s?.person_id, elenaPerson);
    assert.equal(s?.has_account, true);

    await rejects(
      () => q(admin, `select finance_link_donor($1, $2, 'Misma persona')`, [donor, elenaPerson]),
      /No autorizado/,
    );
    await rejects(
      () => q(finanzas, `select finance_link_donor($1, $1, 'Misma persona')`, [donor]),
      /Elige una persona del directorio/,
    );
    const moved = await q<{ n: number }>(
      finanzas,
      `select finance_link_donor($1, $2, 'Es la misma persona, se registró') as n`,
      [donor, elenaPerson],
    );
    assert.equal(moved[0]!.n, 1);
    const left = await db.query(`select 1 from people where id = $1`, [donor]);
    assert.equal(left.rows.length, 0);
    const rev = await q<{ action: string; reason: string }>(
      finanzas,
      `select r.action, r.reason from donation_revisions r join donations d on d.id = r.donation_id
        where d.person_id = $1 order by r.revision desc limit 1`,
      [elenaPerson],
    );
    assert.equal(rev[0]!.action, "corregida");
    assert.match(rev[0]!.reason, /Donante vinculado/);
  });

  test("descartar una sugerencia la oculta", async () => {
    const donor = (
      await q<{ id: string }>(
        finanzas,
        `select finance_create_donor('Ana Lucía', 'Pérez Ríos', true) as id`,
      )
    )[0]!.id;
    await q(finanzas, `select finance_dismiss_link_suggestion($1, $2)`, [donor, directoryPerson]);
    const sugg = await q<{ donor_id: string }>(
      finanzas,
      `select * from finance_donor_link_suggestions()`,
    );
    assert.ok(!sugg.some((x) => x.donor_id === donor));
  });
});
