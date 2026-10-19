/**
 * Registro central de personas (0054) contra un Postgres aislado en
 * memoria. Datos 100 % sintéticos.   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrationsFrom, asUser, createTestDb, createUser, personOf } from "./harness";

type Json = Record<string, unknown>;
let db: PGlite;
let admin: string;
let seguimiento: string;
let finanzas: string;
let leaderA: string; // líder del ministerio A, sin rol de staff
let leaderB: string;
let ministryA: string;
let ministryB: string;

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

async function q<T = Json>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
}

/** Como el servidor (service_role, sin sesión de usuario). */
async function asService<T = Json>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role service_role`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role`);
  }
}

async function person(data: Json): Promise<string> {
  const cols = Object.keys(data);
  const { rows } = await db.query<{ id: string }>(
    `insert into people (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(data),
  );
  return rows[0]!.id;
}

/** Cuenta registrada por la propia persona (trigger: persona nueva). */
async function signUp(first: string, last: string, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('first_name', $2::text, 'last_name', $3::text)) returning id`,
    [email, first, last],
  );
  return rows[0]!.id;
}

type Match = { person_id: string; level: string; reasons: string[]; email_hint: string | null };

async function matches(
  user: string,
  ctx: string,
  ministry: string | null,
  first: string,
  last: string,
  email: string | null = null,
  phone: string | null = null,
  birth: string | null = null,
): Promise<Match[]> {
  return q<Match>(user, `select * from person_matches($1, $2, $3, $4, $5, $6, $7::date)`, [
    ctx,
    ministry,
    first,
    last,
    email,
    phone,
    birth,
  ]);
}

async function register(
  user: string,
  data: Json,
  ack: string[] = [],
  key = randomUUID(),
  ctx = "directorio",
) {
  const r = await q<{ id: string }>(user, `select register_person($1, $2, $3::uuid[], $4) as id`, [
    ctx,
    JSON.stringify(data),
    ack,
    key,
  ]);
  return r[0]!.id;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select (${sql})::int as n`, params);
  return rows[0]!.n;
}

before(async () => {
  db = await createTestDb();
  admin = await createUser(db, "admin", ["administrador"]);
  seguimiento = await createUser(db, "seguimiento", ["seguimiento"]);
  const apostol = await createUser(db, "apostol");
  finanzas = await createUser(db, "finanzas");
  await db.query(`select bootstrap_first_apostol($1, 'Prueba: alta inicial sintética')`, [apostol]);
  await q(apostol, `select apostol_set_financial_role($1, 'finanzas', true, 'Tesorería')`, [
    finanzas,
  ]);
  leaderA = await createUser(db, "lider-a");
  leaderB = await createUser(db, "lider-b");
  const { rows } = await db.query<{ id: string }>(
    `insert into ministries (name, leader_person_id) values ('Alabanza', $1), ('Ujieres', $2) returning id`,
    [await personOf(db, leaderA), await personOf(db, leaderB)],
  );
  ministryA = rows[0]!.id;
  ministryB = rows[1]!.id;
});

after(async () => {
  await db.close();
});

describe("normalización y coincidencias", () => {
  test("formatos equivalentes de teléfono y correo concuerdan", async () => {
    const id = await person({
      first_name: "Lucía",
      last_name: "Ortiz Vega",
      email: "Lucia.Ortiz@Example.test",
      phone: "+1 (787) 555-0101",
    });
    const m = await matches(
      seguimiento,
      "directorio",
      null,
      "lucia",
      "ortiz vega",
      " lucia.ortiz@example.test ",
      "787-555-0101",
    );
    assert.equal(m[0]?.person_id, id);
    assert.equal(m[0]?.level, "confiable");
    assert.deepEqual(m[0]?.reasons, ["Mismo nombre", "Mismo correo", "Mismo teléfono"]);
    assert.equal(m[0]?.email_hint, "L•••@Example.test");
    // El valor original se conserva.
    const { rows } = await db.query<{ phone: string }>(`select phone from people where id = $1`, [
      id,
    ]);
    assert.equal(rows[0]!.phone, "+1 (787) 555-0101");
  });

  test("mismo nombre: posible; con fecha distinta: no aparece", async () => {
    const a = await person({ first_name: "José", last_name: "Rivera", birth_date: "1980-01-01" });
    const b = await person({ first_name: "Jose", last_name: "Rivera", birth_date: "1995-06-30" });
    const onlyName = await matches(seguimiento, "directorio", null, "José", "Rivera");
    assert.equal(onlyName.length, 2);
    assert.ok(onlyName.every((m) => m.level === "posible"));
    const withBirth = await matches(
      seguimiento,
      "directorio",
      null,
      "José",
      "Rivera",
      null,
      null,
      "1995-06-30",
    );
    assert.deepEqual(
      withBirth.map((m) => [m.person_id, m.level]),
      [[b, "confiable"]],
    );
    assert.ok(!withBirth.some((m) => m.person_id === a));
  });

  test("correo compartido con otro nombre es solo posible", async () => {
    await person({
      first_name: "Pedro",
      last_name: "Santos",
      email: "familia.santos@example.test",
    });
    const m = await matches(
      seguimiento,
      "directorio",
      null,
      "Carmen",
      "Santos",
      "familia.santos@example.test",
    );
    assert.equal(m.length, 1);
    assert.equal(m[0]!.level, "posible");
    assert.ok(m[0]!.reasons.includes("Nombre distinto"));
  });

  test("sin datos suficientes no se busca; un miembro sin rol no puede buscar", async () => {
    assert.equal((await matches(seguimiento, "directorio", null, "Jo", "")).length, 0);
    const miembro = await createUser(db, "miembro-curioso");
    await rejects(() => matches(miembro, "directorio", null, "José", "Rivera"), /No autorizado/);
    await rejects(() => matches(miembro, "finanzas", null, "José", "Rivera"), /No autorizado/);
  });

  test("person_match_candidates no se puede llamar directo", async () => {
    await rejects(
      () => q(seguimiento, `select * from person_match_candidates('a','b',null,null,null)`),
      /permission denied/,
    );
  });
});

describe("alta común", () => {
  test("pide revisar coincidencias, crea al confirmarlas y no duplica envíos", async () => {
    const existing = await person({ first_name: "Marta", last_name: "Colón", phone: "7875550111" });
    const data = { first_name: "Marta", last_name: "Colón", phone: "(787) 555-0111" };
    await rejects(() => register(seguimiento, data), /COINCIDENCIAS/);
    const key = randomUUID();
    const id = await register(seguimiento, data, [existing], key);
    assert.notEqual(id, existing);
    // El mismo envío repetido devuelve la misma persona.
    assert.equal(await register(seguimiento, data, [existing], key), id);
    assert.equal(await count(`select count(*) from people where name_key = 'marta colon'`), 2);
  });

  test("visita: solo el nombre basta y queda como visitante", async () => {
    const id = await register(
      seguimiento,
      { first_name: "Visitante Único" },
      [],
      randomUUID(),
      "visita",
    );
    const { rows } = await db.query<{ membership_status: string; source: string }>(
      `select membership_status, source from people where id = $1`,
      [id],
    );
    assert.deepEqual(rows[0], { membership_status: "visitante", source: "visita" });
  });

  test("datos inválidos y permisos", async () => {
    await rejects(() => register(seguimiento, { first_name: "" }), /Escribe el nombre/);
    await rejects(
      () => register(seguimiento, { first_name: "Ana", email: "no-es-correo" }),
      /correo no es válido/,
    );
    await rejects(() => register(leaderA, { first_name: "Zeta", last_name: "Q" }), /No autorizado/);
  });
});

describe("suscriptor que luego registra visitas o aportaciones", () => {
  test("Visitantes y Finanzas encuentran a la persona de la cuenta", async () => {
    const user = await signUp("Carla", "Benítez", "carla.b@example.test");
    const p = await personOf(db, user);
    type M = Match & { has_account: boolean; finance_only: boolean };
    const v = await q<M>(
      seguimiento,
      `select * from person_matches('directorio', null, 'Carla', 'Benitez', 'CARLA.B@example.test')`,
    );
    assert.equal(v[0]?.person_id, p);
    assert.equal(v[0]?.level, "confiable");
    assert.equal(v[0]?.has_account, true);
    // Crear otra persona sin reconocer la coincidencia no se permite.
    await rejects(
      () =>
        register(
          seguimiento,
          { first_name: "Carla", last_name: "Benítez", email: "carla.b@example.test" },
          [],
          randomUUID(),
          "visita",
        ),
      /COINCIDENCIAS/,
    );
    const donor = await q<{ id: string }>(
      finanzas,
      `select finance_create_donor('Ofelia', 'Ramos') as id`,
    );
    const f = await q<M>(
      finanzas,
      `select * from person_matches('finanzas', null, 'Carla', 'Benítez', 'carla.b@example.test')`,
    );
    assert.equal(f[0]?.person_id, p);
    const fo = await q<M>(
      finanzas,
      `select * from person_matches('finanzas', null, 'Ofelia', 'Ramos')`,
    );
    assert.equal(fo[0]?.person_id, donor[0]!.id);
    assert.equal(fo[0]?.finance_only, true);
    // Fuera de Finanzas, un donante solo de Finanzas no aparece.
    const d = await q<M>(
      seguimiento,
      `select * from person_matches('directorio', null, 'Ofelia', 'Ramos')`,
    );
    assert.equal(d.length, 0);
  });
});

describe("integrantes por ministerio", () => {
  let added: string;

  test("el líder registra a alguien sin cuenta y lo asigna, sin duplicar", async () => {
    const key = randomUUID();
    const call = () =>
      q<{ r: Json }>(leaderA, `select ministry_add_person($1, null, $2, '{}', $3) as r`, [
        ministryA,
        JSON.stringify({
          first_name: "Raúl",
          last_name: "Méndez",
          email: "raul.mendez@example.test",
        }),
        key,
      ]);
    const r1 = (await call())[0]!.r;
    assert.equal(r1.person_created, true);
    assert.equal(r1.membership, "agregada");
    added = r1.person_id as string;
    const r2 = (await call())[0]!.r;
    assert.equal(r2.person_id, added);
    assert.equal(r2.person_created, false);
    assert.equal(r2.membership, "ya_integrante");
    const st = await q<{ has_account: boolean }>(
      leaderA,
      `select has_account from people_account_status(array[$1]::uuid[])`,
      [added],
    );
    assert.equal(st[0]?.has_account, false);
    // Integrante, no líder: no gestiona el ministerio.
    const { rows } = await db.query<{ role_in_ministry: string }>(
      `select role_in_ministry from ministry_memberships where person_id = $1`,
      [added],
    );
    assert.equal(rows[0]!.role_in_ministry, "miembro");
  });

  test("un líder no gestiona ni busca en otro ministerio, ni en Finanzas", async () => {
    await rejects(
      () => q(leaderB, `select ministry_add_person($1, $2, null, null, null)`, [ministryA, added]),
      /No autorizado/,
    );
    await rejects(
      () => matches(leaderB, "ministerio", ministryA, "Raúl", "Méndez"),
      /No autorizado/,
    );
    await rejects(() => matches(leaderA, "finanzas", null, "Raúl", "Méndez"), /No autorizado/);
    await rejects(() => q(leaderA, `select * from finance_search_people('Raúl')`), /No autorizado/);
    // Su búsqueda solo devuelve lo mínimo (contacto enmascarado).
    const m = await matches(
      leaderB,
      "ministerio",
      ministryB,
      "Raúl",
      "Méndez",
      "raul.mendez@example.test",
    );
    assert.equal(m[0]?.email_hint, "r•••@example.test");
    const st = await q(leaderB, `select * from people_account_status(array[$1]::uuid[])`, [added]);
    assert.equal(st.length, 0);
  });

  test("importación: vista previa, decisiones, aplicar y repetir sin duplicar", async () => {
    await person({ first_name: "Elena", last_name: "Cruz", email: "elena.cruz@example.test" });
    await person({ first_name: "Ana", last_name: "Torres" });
    await person({ first_name: "Ana", last_name: "Torres" });
    const rows = [
      { row_number: 2, first_name: "Nuevo", last_name: "Integrante", email: "nuevo@example.test" },
      { row_number: 3, first_name: "Elena", last_name: "Cruz", email: "ELENA.CRUZ@example.test" },
      { row_number: 4, first_name: "Nuevo", last_name: "Integrante", email: "nuevo@example.test" },
      { row_number: 5, first_name: "Malo", last_name: "Correo", email: "malo@" },
      { row_number: 6, first_name: "Ana", last_name: "Torres" },
    ];
    const create = async () =>
      (
        await q<{ id: string }>(
          leaderA,
          `select ministry_import_create_batch($1, 'lista.csv', $2) as id`,
          [ministryA, JSON.stringify(rows)],
        )
      )[0]!.id;
    const batch = await create();
    type R = {
      id: string;
      row_number: number;
      decision: string;
      match_level: string;
      errors: string[];
      candidates: Json[];
    };
    const list = async (b: string) =>
      q<R>(leaderA, `select * from ministry_import_rows where batch_id = $1 order by row_number`, [
        b,
      ]);
    const preview = await list(batch);
    assert.deepEqual(
      preview.map((r) => [r.row_number, r.decision, r.match_level]),
      [
        [2, "crear", "ninguna"],
        [3, "usar_existente", "confiable"],
        [4, "omitir", "ninguna"],
        [5, "omitir", "ninguna"],
        [6, "pendiente", "posible"],
      ],
    );
    assert.match(preview[2]!.errors[0]!, /Repetida en el archivo \(fila 2\)/);
    assert.deepEqual(preview[3]!.errors, ["Correo inválido."]);

    // Lo ambiguo no se aplica hasta decidir; no se puede elegir a alguien fuera de la lista.
    await rejects(
      () =>
        q(leaderA, `select ministry_import_decide($1, 'usar_existente', $2)`, [
          preview[4]!.id,
          added,
        ]),
      /Elige una de las coincidencias/,
    );
    const r1 = (await q<{ r: Json }>(leaderA, `select ministry_import_apply($1) as r`, [batch]))[0]!
      .r;
    assert.deepEqual([r1.creadas, r1.agregadas, r1.omitidas, r1.pendientes], [1, 1, 2, 1]);
    await q(leaderA, `select ministry_import_decide($1, 'crear', null)`, [preview[4]!.id]);
    const r2 = (await q<{ r: Json }>(leaderA, `select ministry_import_apply($1) as r`, [batch]))[0]!
      .r;
    assert.equal(r2.creadas, 1);
    // Aplicar otra vez no hace nada.
    const r3 = (await q<{ r: Json }>(leaderA, `select ministry_import_apply($1) as r`, [batch]))[0]!
      .r;
    assert.equal(Number(r3.creadas) + Number(r3.agregadas) + Number(r3.ya_integrantes), 0);

    const peopleBefore = await count(`select count(*) from people`);
    const membersBefore = await count(
      `select count(*) from ministry_memberships where ministry_id = $1`,
      [ministryA],
    );
    // El mismo archivo otra vez: reutiliza y no duplica.
    const batch2 = await create();
    const again = await list(batch2);
    assert.equal(again[0]!.decision, "usar_existente");
    const anaRow = again[4]!;
    assert.equal(anaRow.decision, "pendiente");
    await q(leaderA, `select ministry_import_decide($1, 'omitir', null)`, [anaRow.id]);
    const r4 = (
      await q<{ r: Json }>(leaderA, `select ministry_import_apply($1) as r`, [batch2])
    )[0]!.r;
    assert.equal(r4.creadas, 0);
    assert.equal(r4.ya_integrantes, 2);
    assert.equal(await count(`select count(*) from people`), peopleBefore);
    assert.equal(
      await count(`select count(*) from ministry_memberships where ministry_id = $1`, [ministryA]),
      membersBefore,
    );
    // Otro líder no ve el lote.
    const other = await q(leaderB, `select * from ministry_import_rows where batch_id = $1`, [
      batch2,
    ]);
    assert.equal(other.length, 0);
  });
});

describe("vinculación verificada de cuentas", () => {
  test("visitante que luego crea su cuenta: código al correo registrado y unificación", async () => {
    const visitor = await person({
      first_name: "Sofía",
      last_name: "Marrero",
      email: "sofia.m@example.test",
      membership_status: "visitante",
    });
    await db.query(`insert into visitor_follow_ups (person_id) values ($1)`, [visitor]);
    await db.query(`insert into ministry_memberships (ministry_id, person_id) values ($1, $2)`, [
      ministryA,
      visitor,
    ]);
    const user = await signUp("Sofia", "Marrero", "sofia.m@example.test");
    const fresh = await personOf(db, user);
    assert.notEqual(fresh, visitor);

    // Un usuario no puede pedir el código directamente (se saltaría el correo).
    await rejects(
      () => q(user, `select identity_claim_start($1, null, null)`, [user]),
      /permission denied/,
    );
    const start = (
      await asService<{ r: Json }>(`select identity_claim_start($1, null, null) as r`, [user])
    )[0]!.r;
    assert.equal(start.send_to, "sofia.m@example.test");
    const code = start.code as string;
    assert.match(code, /^\d{6}$/);

    const wrong = (
      await asService<{ r: Json }>(`select identity_claim_verify($1, '000000x') as r`, [user])
    )[0]!.r;
    assert.equal(wrong.ok, false);
    const ok = (
      await asService<{ r: Json }>(`select identity_claim_verify($1, $2) as r`, [user, code])
    )[0]!.r;
    assert.equal(ok.ok, true);

    assert.equal(await personOf(db, user), visitor);
    assert.equal(await count(`select count(*) from people where id = $1`, [fresh]), 0);
    assert.equal(
      await count(`select count(*) from visitor_follow_ups where person_id = $1`, [visitor]),
      1,
    );
    assert.equal(
      await count(
        `select count(*) from ministry_memberships where person_id = $1 and left_at is null`,
        [visitor],
      ),
      1,
    );
    const resolved = await q<{ id: string }>(admin, `select resolve_person_id($1) as id`, [fresh]);
    assert.equal(resolved[0]!.id, visitor);
    const merges = await q<{ kind: string }>(
      admin,
      `select kind from person_merges where merged_person_id = $1`,
      [fresh],
    );
    assert.equal(merges[0]?.kind, "vinculacion_cuenta");

    // Ya vinculada: otra cuenta no la puede reclamar.
    const intruder = await signUp("Sofía", "Marrero", "otra.sofia@example.test");
    const s2 = (
      await asService<{ r: Json }>(`select identity_claim_start($1, null, null) as r`, [intruder])
    )[0]!.r;
    assert.equal(s2.code, null);
    assert.equal(s2.status, "ok");
  });

  test("persona añadida por un líder que después se registra conserva su ministerio", async () => {
    const r = (
      await q<{ r: Json }>(leaderB, `select ministry_add_person($1, null, $2, '{}', $3) as r`, [
        ministryB,
        JSON.stringify({ first_name: "Iván", last_name: "Rosado", email: "ivan.r@example.test" }),
        randomUUID(),
      ])
    )[0]!.r;
    const pre = r.person_id as string;
    const user = await signUp("Ivan", "Rosado", "ivan.r@example.test");
    const start = (
      await asService<{ r: Json }>(`select identity_claim_start($1, null, null) as r`, [user])
    )[0]!.r;
    await asService(`select identity_claim_verify($1, $2)`, [user, start.code]);
    assert.equal(await personOf(db, user), pre);
    assert.equal(
      await count(
        `select count(*) from ministry_memberships where person_id = $1 and ministry_id = $2`,
        [pre, ministryB],
      ),
      1,
    );
  });

  test("ambigua, sin correo o sin coincidencia: no se envía código", async () => {
    // Dos registros iguales que comparten correo: ambigua.
    await person({ first_name: "Luis", last_name: "Vega", email: "vega.casa@example.test" });
    await person({ first_name: "Luis", last_name: "Vega", email: "vega.casa@example.test" });
    const u1 = await signUp("Luis", "Vega", "vega.casa@example.test");
    const s1 = (
      await asService<{ r: Json }>(`select identity_claim_start($1, null, null) as r`, [u1])
    )[0]!.r;
    assert.equal(s1.code, null);
    // Coincide por teléfono recién dado, pero el registro no tiene correo:
    // el teléfono nuevo no prueba nada.
    await person({ first_name: "Nora", last_name: "Pagán", phone: "787-555-0199" });
    const u2 = await signUp("Nora", "Pagán", "nora.nueva@example.test");
    const s2 = (
      await asService<{ r: Json }>(`select identity_claim_start($1, '7875550199', null) as r`, [u2])
    )[0]!.r;
    assert.equal(s2.code, null);
    const v = (
      await asService<{ r: Json }>(`select identity_claim_verify($1, '123456') as r`, [u2])
    )[0]!.r;
    assert.equal(v.ok, false);
    // Revisión por un administrador.
    await q(u2, `select request_identity_review('7875550199', null, 'Fui visitante en 2025')`);
    const list = await q<{
      request_id: string;
      candidates: { id: string }[];
      last_outcome: string;
    }>(admin, `select * from identity_review_list()`);
    const mine = list.find((x) => x.last_outcome === "sin_correo")!;
    assert.ok(mine.candidates.length >= 1);
    await rejects(() => q(seguimiento, `select * from identity_review_list()`), /No autorizado/);
    await q(admin, `select identity_review_resolve($1, $2, 'Verificado en persona con ID')`, [
      mine.request_id,
      mine.candidates[0]!.id,
    ]);
    assert.equal(await personOf(db, u2), mine.candidates[0]!.id);
  });

  test("límite de intentos del código", async () => {
    await person({ first_name: "Gabriel", last_name: "Soto", email: "gabriel.s@example.test" });
    const user = await signUp("Gabriel", "Soto", "gabriel.s@example.test");
    const start = (
      await asService<{ r: Json }>(`select identity_claim_start($1, null, null) as r`, [user])
    )[0]!.r;
    for (let i = 0; i < 5; i++)
      await asService(`select identity_claim_verify($1, '999999x')`, [user]);
    const last = (
      await asService<{ r: Json }>(`select identity_claim_verify($1, $2) as r`, [user, start.code])
    )[0]!.r;
    assert.equal(last.ok, false);
  });
});

describe("unificación de duplicados", () => {
  test("traslada todo, combina lo repetido y no cambia importes", async () => {
    const s = await person({ first_name: "Héctor", last_name: "Díaz", phone: "7875550300" });
    const m = await person({
      first_name: "Hector",
      last_name: "Diaz",
      phone: "787 555 0300",
      email: "hector.d@example.test",
      birth_date: "1970-02-02",
    });
    await db.query(
      `insert into ministry_memberships (ministry_id, person_id, joined_at, role_in_ministry)
       values ($1, $2, '2024-05-01', 'miembro'), ($1, $3, '2020-01-01', 'colider'), ($4, $3, '2021-01-01', 'miembro')`,
      [ministryA, s, m, ministryB],
    );
    const { rows: don } = await db.query<{ id: string }>(
      `insert into donations (person_id, donation_date, amount_cents, donation_type, payment_method, idempotency_key)
       values ($1, '2026-03-01', 12345, 'diezmo', 'efectivo', gen_random_uuid()) returning id`,
      [m],
    );
    const pairs = await q<{ person_a: string; person_b: string; level: string }>(
      seguimiento,
      `select * from person_duplicate_pairs(500)`,
    );
    assert.ok(
      pairs.some(
        (p) =>
          [p.person_a, p.person_b].sort().join() === [s, m].sort().join() &&
          p.level === "confiable",
      ),
    );

    const preview = (
      await q<{ p: Json }>(admin, `select person_merge_preview($1, $2) as p`, [s, m])
    )[0]!.p;
    assert.equal(preview.blocked, null);
    assert.deepEqual(preview.shared_ministries, ["Alabanza"]);
    // El administrador no tiene acceso financiero: no ve donaciones.
    assert.equal((preview.merged as Json & { relations: Json }).relations.donaciones, undefined);
    await rejects(
      () => q(seguimiento, `select person_merge($1, $2, 'duplicado')`, [s, m]),
      /No autorizado/,
    );

    await q(
      admin,
      `select person_merge($1, $2, 'Duplicado confirmado por teléfono', '{first_name}')`,
      [s, m],
    );
    const { rows } = await db.query<Json>(
      `select first_name, email, birth_date::text from people where id = $1`,
      [s],
    );
    assert.deepEqual(rows[0], {
      first_name: "Hector",
      email: "hector.d@example.test",
      birth_date: "1970-02-02",
    });
    const ms = await db.query<{ ministry_id: string; joined_at: string; role_in_ministry: string }>(
      `select ministry_id, joined_at::text, role_in_ministry from ministry_memberships where person_id = $1 order by joined_at`,
      [s],
    );
    assert.deepEqual(
      ms.rows.map((r) => [r.joined_at, r.role_in_ministry]),
      [
        ["2020-01-01", "colider"],
        ["2021-01-01", "miembro"],
      ],
    );
    const d = await db.query<{ person_id: string; amount_cents: string; donation_date: string }>(
      `select person_id, amount_cents::text, donation_date::text from donations where id = $1`,
      [don[0]!.id],
    );
    assert.deepEqual(d.rows[0], {
      person_id: s,
      amount_cents: "12345",
      donation_date: "2026-03-01",
    });
    assert.equal(
      await count(
        `select count(*) from donation_revisions where donation_id = $1 and action = 'corregida'`,
        [don[0]!.id],
      ),
      1,
    );
    const trail = await q<{ merged_by: string }>(
      admin,
      `select merged_by from person_merges where merged_person_id = $1`,
      [m],
    );
    assert.equal(trail[0]!.merged_by, admin);
    await rejects(() => db.query(`delete from person_merges`), /no se modifica/);
  });

  test("dos cuentas distintas no se unen", async () => {
    const u1 = await signUp("Doble", "Cuenta", "doble1@example.test");
    const u2 = await signUp("Doble", "Cuenta", "doble2@example.test");
    const p = (
      await q<{ p: Json }>(admin, `select person_merge_preview($1, $2) as p`, [
        await personOf(db, u1),
        await personOf(db, u2),
      ])
    )[0]!.p;
    assert.match(String(p.blocked), /Las dos tienen cuenta/);
    await rejects(
      async () =>
        q(admin, `select person_merge($1, $2, 'intento de unir')`, [
          await personOf(db, u1),
          await personOf(db, u2),
        ]),
      /DOS_CUENTAS/,
    );
  });

  test("descartar una pareja la quita de la lista", async () => {
    const a = await person({ first_name: "Gemela", last_name: "Uno", email: "gem@example.test" });
    const b = await person({ first_name: "Gemela", last_name: "Uno", email: "gem@example.test" });
    await q(seguimiento, `select person_duplicate_dismiss($1, $2, 'Son gemelas')`, [a, b]);
    const pairs = await q<{ person_a: string; person_b: string }>(
      seguimiento,
      `select * from person_duplicate_pairs(500)`,
    );
    assert.ok(
      !pairs.some(
        (p) => [p.person_a, p.person_b].includes(a) && [p.person_a, p.person_b].includes(b),
      ),
    );
  });
});

describe("migración sobre datos del esquema anterior", () => {
  test("conserva personas y relaciones, y deja los duplicados para revisión", async () => {
    const old = await createTestDb({ stopBefore: "0054" });
    try {
      const { rows } = await old.query<{ id: string }>(
        `insert into people (first_name, last_name, email, phone) values
           ('Juan', 'Pérez', 'juan@example.test', '787-555-0001'),
           ('Juan', 'Perez', 'JUAN@example.test', null),
           ('Juan', 'Pérez', null, null)
         returning id`,
      );
      const { rows: mi } = await old.query<{ id: string }>(
        `insert into ministries (name) values ('Niños') returning id`,
      );
      await old.query(`insert into ministry_memberships (ministry_id, person_id) values ($1, $2)`, [
        mi[0]!.id,
        rows[0]!.id,
      ]);
      await applyMigrationsFrom(old, "0054");
      const after = await old.query<{ n: number }>(`select count(*)::int as n from people`);
      assert.equal(after.rows[0]!.n, 3);
      const keys = await old.query<{ email_key: string | null; phone_key: string | null }>(
        `select email_key, phone_key from people where id = $1`,
        [rows[1]!.id],
      );
      assert.deepEqual(keys.rows[0], { email_key: "juan@example.test", phone_key: null });
      const mm = await old.query<{ n: number }>(
        `select count(*)::int as n from ministry_memberships where person_id = $1`,
        [rows[0]!.id],
      );
      assert.equal(mm.rows[0]!.n, 1);
      assert.equal((await old.query(`select * from person_merges`)).rows.length, 0);
    } finally {
      await old.close();
    }
  });
});
