/**
 * Cultos recurrentes + check-in por ujieres (migraciones 0031–0032), contra
 * un Postgres aislado en memoria. Datos 100 % sintéticos.
 *
 *   npm run test:db
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createTestDb, createUser, personOf } from "./harness";

let db: PGlite;
let admin: string;
let ujier: string;
let ujier2: string;
let miembro: string;
let gestor: string;
let control: string;
let corrector: string;
let seguimiento: string;
let visitorId: string; // persona sin cuenta

type Json = Record<string, unknown>;

async function one<T = Json>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await db.query<T>(sql, params);
  return rows[0]!;
}

async function rejects(fn: () => Promise<unknown>, match: RegExp) {
  await assert.rejects(fn, (err: Error) => {
    assert.match(err.message, match);
    return true;
  });
}

/** Culto especial (superusuario) con apertura relativa a now(). */
async function makeOpenService(label: string, opts: { closesInMinutes?: number } = {}) {
  const row = await one<{ id: string }>(
    `insert into services (name, service_type, service_date, starts_at, checkin_opens_at, checkin_closes_at)
     values ($1, 'otro', current_date, now() + interval '30 minutes', now() - interval '30 minutes',
             case when $2::int is null then null else now() + make_interval(mins => $2::int) end)
     returning id`,
    [label, opts.closesInMinutes ?? null],
  );
  return row.id;
}

async function record(user: string, serviceId: string, personId: string, method = "manual") {
  return asUser(db, user, async () => {
    const { rows } = await db.query<{ r: Json }>(
      `select record_service_attendance($1, $2, $3::checkin_method) as r`,
      [serviceId, personId, method],
    );
    return rows[0]!.r;
  });
}

before(async () => {
  db = await createTestDb();
  admin = await createUser(db, "admin", ["administrador"]);
  ujier = await createUser(db, "ujier1");
  ujier2 = await createUser(db, "ujier2");
  miembro = await createUser(db, "miembro");
  gestor = await createUser(db, "gestor", ["gestion_cultos"]);
  control = await createUser(db, "control", ["control_checkin"]);
  corrector = await createUser(db, "corrector", ["correccion_asistencia"]);
  seguimiento = await createUser(db, "seguimiento", ["seguimiento"]);
  visitorId = (
    await one<{ id: string }>(
      `insert into people (first_name, last_name, phone) values ('Visita', 'Sincuenta', '787-555-0142') returning id`,
    )
  ).id;

  // El acceso de ujier se concede como en la app: admin_set_person_roles.
  for (const u of [ujier, ujier2]) {
    const pid = await personOf(db, u);
    await asUser(db, admin, () =>
      db.query(
        `select admin_set_person_roles($1, '{miembro}'::app_role[], '{miembro,ujier}'::app_role[], 'Prueba')`,
        [pid],
      ),
    );
  }
});

after(async () => {
  await db?.close();
});

describe("programación recurrente", () => {
  test("tres series con día y hora correctos en Puerto Rico", async () => {
    const { rows } = await db.query<{ name: string; dow: number; local: string; utc: string }>(`
      select name, extract(dow from service_date)::int as dow,
             to_char(starts_at at time zone 'America/Puerto_Rico', 'HH24:MI') as local,
             to_char(starts_at at time zone 'UTC', 'HH24:MI') as utc
      from services where series_id is not null`);
    assert.ok(rows.length >= 12, "cuatro semanas × tres cultos");
    const expected: Record<string, { dow: number; local: string; utc: string }> = {
      "Culto dominical": { dow: 0, local: "09:30", utc: "13:30" },
      "Culto de miércoles": { dow: 3, local: "19:30", utc: "23:30" },
      "Culto de jóvenes": { dow: 5, local: "19:30", utc: "23:30" },
    };
    for (const r of rows) {
      const e = expected[r.name];
      assert.ok(e, `serie inesperada ${r.name}`);
      assert.deepEqual({ dow: r.dow, local: r.local, utc: r.utc }, e, r.name);
    }
    const byName = await db.query<{ name: string; n: number }>(
      `select name, count(*)::int as n from services where series_id is not null group by name`,
    );
    for (const r of byName.rows) assert.ok(r.n >= 4 && r.n <= 5, `${r.name}: ${r.n}`);
  });

  test("apertura una hora antes y sin cierre automático por defecto", async () => {
    const r = await one<{ diff: number; closes: string | null }>(`
      select extract(epoch from starts_at - checkin_opens_at)::int as diff, checkin_closes_at as closes
      from services where series_id is not null limit 1`);
    assert.equal(r.diff, 3600);
    assert.equal(r.closes, null);
  });

  test("mismo resultado aunque la sesión use otra zona horaria", async () => {
    const snapshot = async () =>
      (
        await db.query(`select series_id, occurrence_date, starts_at, service_date, start_time from services
                       where series_id is not null order by 1, 2`)
      ).rows;
    const base = JSON.stringify(await snapshot());
    for (const tz of ["Asia/Tokyo", "America/Los_Angeles", "UTC"]) {
      await db.exec(`set timezone = '${tz}'`);
      const created = await one<{ n: number }>(`select generate_service_occurrences() as n`);
      assert.equal(created.n, 0, `sin duplicados con timezone ${tz}`);
      assert.equal(JSON.stringify(await snapshot()), base);
    }
    await db.exec(`reset timezone`);
  });

  test("generación repetida no duplica y el índice único bloquea duplicados", async () => {
    const before = await one<{ n: number }>(`select count(*)::int as n from services`);
    for (let i = 0; i < 3; i++) await db.query(`select generate_service_occurrences()`);
    const afterRuns = await one<{ n: number }>(`select count(*)::int as n from services`);
    assert.equal(afterRuns.n, before.n);
    await rejects(
      () =>
        db.query(`insert into services (name, service_date, starts_at, checkin_opens_at, series_id, occurrence_date)
                  select name, service_date, starts_at, checkin_opens_at, series_id, occurrence_date
                  from services where series_id is not null limit 1`),
      /duplicate key|services_series_occurrence_uidx/,
    );
  });

  test("usuarios sin rol no pueden ejecutar el generador", async () => {
    await asUser(db, miembro, async () => {
      await rejects(() => db.query(`select generate_service_occurrences()`), /permission denied/);
      await rejects(() => db.query(`select ensure_service_occurrences()`), /No autorizado/);
    });
    await asUser(db, ujier, async () => {
      const r = await db.query(`select ensure_service_occurrences() as n`);
      assert.equal((r.rows[0] as Json).n, 0);
    });
  });

  test("cancelación y cambio manual no se deshacen ni se recrean", async () => {
    const [a, b] = (
      await db.query<{ id: string }>(
        `select id from services where series_id is not null order by starts_at offset 1 limit 2`,
      )
    ).rows;
    await asUser(db, gestor, async () => {
      await db.query(`select cancel_service($1, 'Actividad especial')`, [a!.id]);
      await db.query(
        `select reschedule_service($1, (select service_date from services where id = $1), time '20:00', 'Cambio')`,
        [b!.id],
      );
    });
    await db.query(`select generate_service_occurrences()`);
    const ra = await one<{ status: string; n: number }>(
      `select status, (select count(*)::int from services s2 where s2.series_id = s.series_id and s2.occurrence_date = s.occurrence_date) as n
       from services s where id = $1`,
      [a!.id],
    );
    assert.deepEqual(ra, { status: "cancelado", n: 1 });
    const rb = await one<{ t: string; exc: boolean }>(
      `select to_char(starts_at at time zone 'America/Puerto_Rico', 'HH24:MI') as t, is_exception as exc from services where id = $1`,
      [b!.id],
    );
    assert.deepEqual(rb, { t: "20:00", exc: true });
  });

  test("cambio de serie desde una fecha conserva historial y asistencia", async () => {
    // Historial: un domingo pasado con asistencia.
    await db.query(`select generate_service_occurrences(date '2026-09-01')`);
    const series = await one<{ id: string }>(
      `select id from service_series where name = 'Culto dominical'`,
    );
    const past = await one<{ id: string; starts_at: string }>(
      `select id, starts_at from services where series_id = $1 and occurrence_date = date '2026-09-06'`,
      [series.id],
    );
    const pastPerson = await personOf(db, miembro);
    await db.query(
      `insert into service_checkins (service_id, person_id, method) values ($1, $2, 'manual')`,
      [past.id, pastPerson],
    );
    // Un domingo futuro con asistencia (se debe conservar tal cual).
    const futureWithAttendance = await one<{ id: string; occurrence_date: string }>(
      `select id, occurrence_date from services where series_id = $1 and occurrence_date > current_date
       and status = 'programado' and not is_exception order by occurrence_date desc limit 1`,
      [series.id],
    );
    await db.query(
      `insert into service_checkins (service_id, person_id, method) values ($1, $2, 'manual')`,
      [futureWithAttendance.id, pastPerson],
    );

    const from = (await one<{ d: string }>(`select (current_date + 1)::text as d`)).d;
    const result = await asUser(db, gestor, () =>
      db.query<{ r: Json }>(
        `select update_service_series($1, $2::date, 'Culto dominical', 'culto_general', 0, time '10:00', null, 60, 180) as r`,
        [series.id, from],
      ),
    );
    const summary = result.rows[0]!.r;
    assert.ok((summary.kept as number) >= 1, "conserva ocurrencias con asistencia o excepciones");

    const pastAfter = await one<{ starts_at: string; n: number }>(
      `select starts_at, (select count(*)::int from service_checkins where service_id = $1) as n from services where id = $1`,
      [past.id],
    );
    assert.equal(new Date(pastAfter.starts_at).getTime(), new Date(past.starts_at).getTime());
    assert.equal(pastAfter.n, 1);

    const kept = await one<{ t: string }>(
      `select to_char(starts_at at time zone 'America/Puerto_Rico', 'HH24:MI') as t from services where id = $1`,
      [futureWithAttendance.id],
    );
    assert.equal(kept.t, "09:30", "la ocurrencia con asistencia no se reescribe");

    const regenerated = await db.query<{ t: string; closes: number }>(
      `select to_char(starts_at at time zone 'America/Puerto_Rico', 'HH24:MI') as t,
              extract(epoch from checkin_closes_at - starts_at)::int / 60 as closes
       from services where series_id = $1 and occurrence_date >= $2::date and not is_exception
         and id <> $3`,
      [series.id, from, futureWithAttendance.id],
    );
    assert.ok(regenerated.rows.length > 0);
    for (const r of regenerated.rows) assert.deepEqual(r, { t: "10:00", closes: 180 });

    const rules = await db.query<{ effective_until: string | null }>(
      `select effective_until::text from service_series_rules where series_id = $1 order by effective_from`,
      [series.id],
    );
    assert.equal(rules.rows.length, 2);
    assert.notEqual(rules.rows[0]!.effective_until, null);
    assert.equal(rules.rows[1]!.effective_until, null);
  });

  test("un cambio de serie no puede aplicar al pasado", async () => {
    const series = await one<{ id: string }>(
      `select id from service_series where name = 'Culto de jóvenes'`,
    );
    await asUser(db, gestor, () =>
      rejects(
        () =>
          db.query(
            `select update_service_series($1, current_date - 1, 'X', 'jovenes', 5, time '19:30', null, 60, null)`,
            [series.id],
          ),
        /desde hoy o una fecha futura/,
      ),
    );
  });
});

describe("ventana de registro", () => {
  test("pendiente antes de abrir, abierto, cerrado por programación y por control manual", async () => {
    const s = await one<{ id: string }>(
      `insert into services (name, service_date, starts_at, checkin_opens_at)
       values ('Futuro', current_date, now() + interval '2 hours', now() + interval '1 hour') returning id`,
    );
    const person = await personOf(db, miembro);
    await rejects(() => record(ujier, s.id, person), /CHECKIN_PENDIENTE/);

    const auto = await makeOpenService("Con cierre", { closesInMinutes: -1 });
    await rejects(() => record(ujier, auto, person), /CHECKIN_CERRADO/);

    const open = await makeOpenService("Abierto");
    const ok = await record(ujier, open, person);
    assert.equal(ok.result, "registrado");

    await asUser(db, ujier, () =>
      rejects(
        () => db.query(`select set_service_checkin_state($1, 'cerrado')`, [open]),
        /No autorizado/,
      ),
    );
    await asUser(db, control, () =>
      db.query(`select set_service_checkin_state($1, 'cerrado')`, [open]),
    );
    await rejects(() => record(ujier, open, visitorId), /CHECKIN_CERRADO/);

    // Control puede abrir antes de hora.
    await asUser(db, control, () =>
      db.query(`select set_service_checkin_state($1, 'abierto')`, [s.id]),
    );
    assert.equal((await record(ujier, s.id, person)).result, "registrado");

    const audit = await one<{ n: number }>(
      `select count(*)::int as n from audit_log where action in ('open_checkin', 'close_checkin')`,
    );
    assert.ok(audit.n >= 2);
  });

  test("culto cancelado no acepta registros", async () => {
    const id = await makeOpenService("Cancelado");
    await asUser(db, admin, () => db.query(`select cancel_service($1, 'Lluvia')`, [id]));
    await rejects(() => record(ujier, id, visitorId), /CHECKIN_CANCELADO/);
  });
});

describe("registro por ujieres", () => {
  test("manual, QR, persona sin cuenta y 'ya registrado' sin duplicar", async () => {
    const id = await makeOpenService("Registro");
    const r1 = await record(ujier, id, visitorId, "manual");
    assert.equal(r1.result, "registrado");
    assert.equal(r1.person_name, "Visita Sincuenta");

    const r2 = await record(ujier2, id, visitorId, "qr");
    assert.equal(r2.result, "ya_registrado");
    assert.equal(r2.by_me, false);

    const retry = await record(ujier, id, visitorId, "manual");
    assert.equal(retry.result, "ya_registrado");
    assert.equal(retry.by_me, true, "un reintento del mismo ujier se reconoce como suyo");

    const qr = await record(ujier2, id, await personOf(db, miembro), "qr");
    assert.equal(qr.result, "registrado");

    const rows = await db.query<{ method: string; checked_in_by: string }>(
      `select method, checked_in_by from service_checkins where service_id = $1 order by checked_in_at`,
      [id],
    );
    assert.equal(rows.rows.length, 2);
    assert.deepEqual(rows.rows.map((r) => r.method).sort(), ["manual", "qr"]);
    assert.equal(rows.rows[0]!.checked_in_by, ujier);
  });

  test("dos ujieres a la vez: una sola asistencia", async () => {
    const id = await makeOpenService("Simultáneo");
    const person = await personOf(db, seguimiento);
    // PGlite usa una sola conexión: se intercalan dos transacciones de
    // distintos ujieres. La garantía real es el índice único parcial,
    // que se verifica abajo con un INSERT directo.
    const results = [await record(ujier, id, person), await record(ujier2, id, person)];
    assert.deepEqual(results.map((r) => r.result).sort(), ["registrado", "ya_registrado"]);
    await rejects(
      () =>
        db.query(`insert into service_checkins (service_id, person_id) values ($1, $2)`, [
          id,
          person,
        ]),
      /service_checkins_one_active_uidx|duplicate key/,
    );
  });

  test("sin permiso: miembro, auto check-in y escritura directa rechazados", async () => {
    const id = await makeOpenService("Rechazos");
    const own = await personOf(db, miembro);
    await rejects(() => record(miembro, id, own), /No autorizado/);
    await asUser(db, miembro, async () => {
      await rejects(
        () =>
          db.query(`insert into service_checkins (service_id, person_id) values ($1, $2)`, [
            id,
            own,
          ]),
        /row-level security/,
      );
      await rejects(
        () => db.query(`select * from search_people_for_checkin($1, 'Visita')`, [id]),
        /No autorizado/,
      );
    });
    await asUser(db, ujier, async () => {
      await rejects(
        () =>
          db.query(`insert into service_checkins (service_id, person_id) values ($1, $2)`, [
            id,
            visitorId,
          ]),
        /row-level security/,
      );
      const upd = await db.query(`update services set status = 'cancelado' where id = $1`, [id]);
      assert.equal(upd.affectedRows, 0, "ujier no escribe services directo");
    });
  });

  test("el ujier solo ve lo mínimo: sin directorio, oración ni administración", async () => {
    await db.query(
      `insert into prayer_requests (requester_person_id, content) values ($1, 'Petición sintética')`,
      [visitorId],
    );
    await asUser(db, ujier, async () => {
      assert.equal(
        (await db.query(`select id from people`)).rows.length,
        1,
        "solo su propia persona",
      );
      assert.equal((await db.query(`select id from prayer_requests`)).rows.length, 0);
      assert.equal((await db.query(`select id from audit_log`)).rows.length, 0);
      assert.equal((await db.query(`select * from import_batches`)).rows.length, 0);
      await rejects(() => db.query(`select * from list_users_with_roles()`), /No autorizado/);

      const id = await makeOpenServiceAsSuper("Búsqueda");
      const res = await db.query<Json>(`select * from search_people_for_checkin($1, 'visi sin')`, [
        id,
      ]);
      assert.equal(res.rows.length, 1);
      assert.deepEqual(Object.keys(res.rows[0]!).sort(), [
        "already_checked_in",
        "display_name",
        "hint",
        "membership_status",
        "person_id",
      ]);
      assert.equal(res.rows[0]!.hint, "Tel. termina en 0142");
      assert.equal(
        (await db.query(`select * from search_people_for_checkin($1, 'v')`, [id])).rows.length,
        0,
      );
    });
  });

  test("la revocación impide nuevas operaciones de inmediato", async () => {
    const tmp = await createUser(db, "ujiertemp");
    const pid = await personOf(db, tmp);
    await asUser(db, admin, () =>
      db.query(`select admin_set_person_roles($1, '{miembro}', '{miembro,ujier}', 'Turno')`, [pid]),
    );
    const id = await makeOpenService("Revocación");
    assert.equal((await record(tmp, id, visitorId)).result, "registrado");

    await asUser(db, admin, () =>
      db.query(
        `select admin_set_person_roles($1, '{miembro,ujier}', '{miembro}', 'Fin de turno')`,
        [pid],
      ),
    );
    const adminPerson = await personOf(db, admin);
    await rejects(() => record(tmp, id, adminPerson), /No autorizado/);

    const audit = await db.query<{ metadata: Json; actor_user_id: string }>(
      `select metadata, actor_user_id from audit_log where action = 'update_roles' and entity_id = $1 order by created_at`,
      [tmp],
    );
    assert.equal(audit.rows.length, 2, "concesión y revocación auditadas");
    assert.equal(audit.rows[1]!.actor_user_id, admin);
    assert.deepEqual(audit.rows[1]!.metadata.removed, ["ujier"]);
  });

  test("solo un administrador concede el acceso", async () => {
    const pid = await personOf(db, miembro);
    for (const u of [ujier, gestor, control, corrector]) {
      await asUser(db, u, () =>
        rejects(
          () =>
            db.query(`select admin_set_person_roles($1, '{miembro}', '{miembro,ujier}', 'x')`, [
              pid,
            ]),
          /No autorizado/,
        ),
      );
    }
  });

  test("los accesos adicionales están separados", async () => {
    const id = await makeOpenService("Separación");
    await rejects(() => record(gestor, id, visitorId), /No autorizado/);
    await rejects(() => record(control, id, visitorId), /No autorizado/);
    await asUser(db, control, () =>
      rejects(() => db.query(`select cancel_service($1, 'x')`, [id]), /No autorizado/),
    );
    await asUser(db, gestor, () =>
      rejects(
        () => db.query(`select set_service_checkin_state($1, 'cerrado')`, [id]),
        /No autorizado/,
      ),
    );
    // Operadores preexistentes (0007) conservan el registro.
    assert.equal((await record(seguimiento, id, visitorId)).result, "registrado");
  });
});

describe("correcciones y reportes", () => {
  test("anular exige permiso y motivo, y queda auditado", async () => {
    const id = await makeOpenService("Correcciones");
    const person = await personOf(db, ujier2);
    const r = await record(ujier, id, person);
    const checkinId = r.checkin_id as string;

    await asUser(db, ujier, () =>
      rejects(
        () => db.query(`select void_service_attendance($1, 'Error de persona')`, [checkinId]),
        /No autorizado/,
      ),
    );
    await asUser(db, corrector, () =>
      rejects(() => db.query(`select void_service_attendance($1, ' ')`, [checkinId]), /motivo/),
    );
    await asUser(db, corrector, () =>
      db.query(`select void_service_attendance($1, 'Se marcó a la persona equivocada')`, [
        checkinId,
      ]),
    );

    const row = await one<{ voided_by: string; void_reason: string }>(
      `select voided_by, void_reason from service_checkins where id = $1`,
      [checkinId],
    );
    assert.equal(row.voided_by, corrector);
    const audit = await one<{ actor_user_id: string; metadata: Json }>(
      `select actor_user_id, metadata from audit_log where action = 'attendance_void' and entity_id = $1`,
      [checkinId],
    );
    assert.equal(audit.actor_user_id, corrector);
    assert.equal(audit.metadata.original_checked_in_by, ujier);

    // Anulada ya no cuenta ni bloquea un registro nuevo correcto.
    assert.equal((await record(ujier, id, person)).result, "registrado");
  });

  test("agregar tras el cierre solo con corrección y motivo", async () => {
    const id = await makeOpenService("Cerrado");
    await asUser(db, admin, () =>
      db.query(`select set_service_checkin_state($1, 'cerrado')`, [id]),
    );
    await rejects(() => record(ujier, id, visitorId), /CHECKIN_CERRADO/);
    await asUser(db, ujier, () =>
      rejects(
        () => db.query(`select correct_attendance_add($1, $2, 'Llegó tarde')`, [id, visitorId]),
        /No autorizado/,
      ),
    );
    const r = await asUser(db, corrector, () =>
      db.query<{ r: Json }>(
        `select correct_attendance_add($1, $2, 'Llegó después del cierre') as r`,
        [id, visitorId],
      ),
    );
    assert.equal(r.rows[0]!.r.result, "registrado");
    const audit = await one<{ n: number }>(
      `select count(*)::int as n from audit_log where action = 'attendance_correction_add'`,
    );
    assert.equal(audit.n, 1);
  });

  test("reporte por fecha y tipo sin contar dos veces ni anuladas", async () => {
    const id = await makeOpenService("Reporte");
    const p1 = await personOf(db, admin);
    await record(ujier, id, p1);
    await record(ujier2, id, p1);
    const p2 = await personOf(db, gestor);
    const r = await record(ujier, id, p2);
    await asUser(db, admin, () =>
      db.query(`select void_service_attendance($1, 'Prueba de reporte')`, [r.checkin_id]),
    );

    const report = await asUser(db, admin, () =>
      db.query<{ attendance: number }>(
        `select attendance::int from service_attendance_report((select service_date from services where id = $1), (select service_date from services where id = $1), 'otro') where service_id = $1`,
        [id],
      ),
    );
    assert.equal(report.rows[0]!.attendance, 1);

    const listed = await asUser(db, ujier, () =>
      db.query<Json>(`select * from list_service_attendance($1, true)`, [id]),
    );
    assert.equal(listed.rows.length, 1, "el ujier no ve anuladas");
    assert.equal(listed.rows[0]!.recorded_by_name, null, "ni quién registró");
  });
});

async function makeOpenServiceAsSuper(label: string) {
  await db.exec(`reset role`);
  try {
    return await makeOpenService(label);
  } finally {
    await db.exec(`set role authenticated`);
  }
}
