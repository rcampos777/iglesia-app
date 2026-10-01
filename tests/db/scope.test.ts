/**
 * Alcance de pastor y maestro (0045): solo "personas a su cargo" y su
 * historial. Datos sintéticos.   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

let db: PGlite;
let pastor: string; // lidera "Jóvenes"
let maestro: string; // imparte Discipulado 1 (terminada)
let seguimiento: string;
let pastorSeguimiento: string; // pastor + seguimiento: directorio completo
let member: string; // persona en Jóvenes
let student: string; // alumno de Discipulado 1 y de otra clase
let outsider: string; // nadie la tiene a cargo
let ownClass: string;
let otherClassOfStudent: string;
let unrelatedClass: string;

async function q<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
}

async function person(first: string, last: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into people (first_name, last_name) values ($1, $2) returning id`,
    [first, last],
  );
  return rows[0]!.id;
}

async function visibleIds(user: string, ids: string[]): Promise<string[]> {
  const rows = await q<{ id: string }>(user, `select id from people where id = any($1::uuid[])`, [
    ids,
  ]);
  return rows.map((r) => r.id).sort();
}

before(async () => {
  db = await createTestDb();
  pastor = await createUser(db, "pastor-scope", ["pastor"]);
  maestro = await createUser(db, "maestro-scope", ["maestro"]);
  seguimiento = await createUser(db, "seguimiento-scope", ["seguimiento"]);
  pastorSeguimiento = await createUser(db, "pastor-seg-scope", ["pastor", "seguimiento"]);
  member = await person("Miembro", "Jóvenes");
  student = await person("Alumno", "Discipulado");
  outsider = await person("Fuera", "DeAlcance");

  const { rows: m } = await db.query<{ id: string }>(
    `insert into ministries (name, leader_person_id) values ('Jóvenes', $1) returning id`,
    [await personOf(db, pastor)],
  );
  await db.query(`insert into ministry_memberships (ministry_id, person_id) values ($1, $2)`, [
    m[0]!.id,
    member,
  ]);
  await db.query(
    `insert into activities (ministry_id, name, activity_date) values (null, 'Retiro general', current_date)`,
  );
  const { rows: act } = await db.query<{ id: string }>(`select id from activities limit 1`);
  await db.query(`insert into activity_participants (activity_id, person_id) values ($1, $2)`, [
    act[0]!.id,
    member,
  ]);

  const { rows: cat } = await db.query<{ id: string }>(
    `insert into course_categories (code, name) values ('FORM', 'Formación') returning id`,
  );
  const { rows: course } = await db.query<{ id: string }>(
    `insert into courses (category_id, name) values ($1, 'Discipulado') returning id`,
    [cat[0]!.id],
  );
  const offering = async (label: string, teacher: string | null, status = "planificada") =>
    (
      await db.query<{ id: string }>(
        `insert into class_offerings (course_id, label, teacher_person_id, status)
         values ($1, $2, $3, $4::class_status) returning id`,
        [course[0]!.id, label, teacher, status],
      )
    ).rows[0]!.id;
  ownClass = await offering("Discipulado 1", await personOf(db, maestro), "completada");
  otherClassOfStudent = await offering("Discipulado 2", null);
  unrelatedClass = await offering("Discipulado 3", null);
  for (const [c, p] of [
    [ownClass, student],
    [otherClassOfStudent, student],
    [unrelatedClass, outsider],
  ] as const) {
    await db.query(`insert into enrollments (class_offering_id, person_id) values ($1, $2)`, [
      c,
      p,
    ]);
  }
  await db.query(`insert into visitor_follow_ups (person_id) values ($1)`, [outsider]);
});

after(async () => {
  await db.close();
});

describe("alcance de pastor y maestro", () => {
  test("el pastor solo ve a la gente de sus ministerios", async () => {
    assert.deepEqual(await visibleIds(pastor, [member, student, outsider]), [member]);
  });

  test("el maestro solo ve a sus alumnos, también de clases terminadas", async () => {
    assert.deepEqual(await visibleIds(maestro, [member, student, outsider]), [student]);
  });

  test("seguimiento y un pastor que además es de seguimiento ven todo el directorio", async () => {
    const all = [member, student, outsider].sort();
    assert.deepEqual(await visibleIds(seguimiento, all), all);
    assert.deepEqual(await visibleIds(pastorSeguimiento, all), all);
  });

  test("el maestro ve sus clases y el historial de su alumno, no las demás clases", async () => {
    const classes = await q<{ id: string }>(maestro, `select id from class_offerings`);
    const ids = classes.map((c) => c.id);
    assert.ok(ids.includes(ownClass));
    assert.ok(ids.includes(otherClassOfStudent), "historial: otra clase de su alumno");
    assert.ok(!ids.includes(unrelatedClass));
    const enr = await q<{ person_id: string }>(maestro, `select person_id from enrollments`);
    assert.deepEqual([...new Set(enr.map((e) => e.person_id))], [student]);
  });

  test("el pastor ve el historial de su gente (ministerio y actividades)", async () => {
    const mm = await q<{ person_id: string }>(pastor, `select person_id from ministry_memberships`);
    assert.deepEqual(
      mm.map((r) => r.person_id),
      [member],
    );
    const acts = await q(pastor, `select id from activities`);
    assert.equal(acts.length, 1);
    const enr = await q(pastor, `select id from enrollments`);
    assert.equal(enr.length, 0);
  });

  test("el pastor crea personas y edita las suyas, no las ajenas", async () => {
    const created = await q<{ id: string }>(
      pastor,
      `insert into people (first_name, last_name, created_by) values ('Nueva', 'DelPastor', auth.uid()) returning id`,
    );
    const newId = created[0]!.id;
    const own = await q(pastor, `update people set city = 'Ponce' where id = $1 returning id`, [
      newId,
    ]);
    assert.equal(own.length, 1);
    const mine = await q(pastor, `update people set city = 'Ponce' where id = $1 returning id`, [
      member,
    ]);
    assert.equal(mine.length, 1);
    const other = await q(pastor, `update people set city = 'Ponce' where id = $1 returning id`, [
      outsider,
    ]);
    assert.equal(other.length, 0);
    // El maestro no edita personas.
    const teacherEdit = await q(
      maestro,
      `update people set city = 'Ponce' where id = $1 returning id`,
      [student],
    );
    assert.equal(teacherEdit.length, 0);
  });

  test("el maestro puede elegir a cualquiera para matricular en SU clase, no en otra", async () => {
    const rows = await q<{ id: string }>(
      maestro,
      `select id from list_people_for_class_enrollment($1)`,
      [ownClass],
    );
    assert.ok(rows.some((r) => r.id === outsider));
    await assert.rejects(
      () => q(maestro, `select id from list_people_for_class_enrollment($1)`, [unrelatedClass]),
      /No autorizado/,
    );
    await q(maestro, `insert into enrollments (class_offering_id, person_id) values ($1, $2)`, [
      ownClass,
      outsider,
    ]);
    assert.ok((await visibleIds(maestro, [outsider])).includes(outsider), "ahora es su alumno");
    await q(maestro, `delete from enrollments where class_offering_id = $1 and person_id = $2`, [
      ownClass,
      outsider,
    ]);
  });

  test("el pastor ya no ve Visitantes ni Importación", async () => {
    assert.equal((await q(pastor, `select id from visitor_follow_ups`)).length, 0);
    assert.equal((await q(seguimiento, `select id from visitor_follow_ups`)).length, 1);
    assert.equal((await q(pastor, `select id from import_batches`)).length, 0);
  });
});
