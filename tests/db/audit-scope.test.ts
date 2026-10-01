/**
 * Auditoría 2026-10-01 (0047): registro de emails y respuestas de
 * encuestas ya no son legibles por cualquier staff. Datos sintéticos.
 *   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

let db: PGlite;
let maestro: string;
let pastor: string; // crea la encuesta
let seguimiento: string;
let miembro: string;
let logId: string;
let responseId: string;

async function q<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, user, async () => (await db.query<T>(sql, params)).rows);
}

before(async () => {
  db = await createTestDb();
  maestro = await createUser(db, "maestro-audit", ["maestro"]);
  pastor = await createUser(db, "pastor-audit", ["pastor"]);
  seguimiento = await createUser(db, "seguimiento-audit", ["seguimiento"]);
  miembro = await createUser(db, "miembro-audit");
  const member = await personOf(db, miembro);

  logId = (
    await db.query<{ id: string }>(
      `insert into notification_log (recipient_person_id, recipient_email, subject, created_by)
       values ($1, 'miembro@example.test', 'Asunto privado', $2) returning id`,
      [member, seguimiento],
    )
  ).rows[0]!.id;

  const survey = (
    await db.query<{ id: string }>(
      `insert into surveys (title, created_by) values ('Encuesta del pastor', $1) returning id`,
      [pastor],
    )
  ).rows[0]!.id;
  const question = (
    await db.query<{ id: string }>(
      `insert into survey_questions (survey_id, question_text) values ($1, '¿Cómo estás?') returning id`,
      [survey],
    )
  ).rows[0]!.id;
  responseId = (
    await db.query<{ id: string }>(
      `insert into survey_responses (survey_id, person_id) values ($1, $2) returning id`,
      [survey, member],
    )
  ).rows[0]!.id;
  await db.query(
    `insert into survey_answers (response_id, question_id, answer_text) values ($1, $2, 'Respuesta personal')`,
    [responseId, question],
  );
});

after(async () => {
  await db.close();
});

describe("registro de emails y encuestas (0047)", () => {
  test("un maestro ya no lee emails enviados a otros; el destinatario y quien envió sí", async () => {
    assert.equal((await q(maestro, `select id from notification_log`)).length, 0);
    assert.equal((await q(miembro, `select id from notification_log`)).length, 1);
    assert.equal((await q(seguimiento, `select id from notification_log`)).length, 1);
  });

  test("un maestro no puede borrar ni editar la bitácora de emails ajena", async () => {
    const del = await q(maestro, `delete from notification_log where id = $1 returning id`, [
      logId,
    ]);
    assert.equal(del.length, 0);
    const upd = await q(
      maestro,
      `update notification_log set subject = 'x' where id = $1 returning id`,
      [logId],
    );
    assert.equal(upd.length, 0);
  });

  test("respuestas de encuesta: el autor de la encuesta y el directorio sí, otro staff no", async () => {
    assert.equal((await q(maestro, `select id from survey_responses`)).length, 0);
    assert.equal((await q(maestro, `select id from survey_answers`)).length, 0);
    assert.equal((await q(pastor, `select id from survey_answers`)).length, 1);
    assert.equal((await q(seguimiento, `select id from survey_answers`)).length, 1);
    assert.equal((await q(miembro, `select id from survey_answers`)).length, 1);
  });
});
