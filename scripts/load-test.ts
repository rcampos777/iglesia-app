/**
 * Prueba de carga con datos SINTÉTICOS (1500 personas + check-ins).
 * Verifica que las lecturas sigan completas pasando el límite de 1000
 * filas de PostgREST. Solo contra el proyecto de DESARROLLO.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/load-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { faker } from "@faker-js/faker/locale/es";
import type { Database } from "../src/types/database";
import { fetchAllPages, fetchInChunks, mapWithConcurrency } from "../src/lib/data/paging";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (process.env.NEXT_PUBLIC_APP_ENV === "production") throw new Error("No en producción.");
const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

const PEOPLE = 1500;
const results: [string, string, boolean][] = [];
const check = (name: string, detail: string, ok: boolean) => {
  results.push([name, detail, ok]);
  console.log(`${ok ? "✅" : "❌"} ${name}: ${detail}`);
};
const ms = (t: number) => `${Math.round(performance.now() - t)} ms`;
const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

async function main() {
  // 1. Personas
  let t = performance.now();
  const people: { id: string }[] = [];
  for (let i = 0; i < PEOPLE; i += 500) {
    const rows = Array.from({ length: Math.min(500, PEOPLE - i) }, () => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      return {
        first_name: firstName,
        last_name: lastName,
        email: faker.internet
          .email({ firstName, lastName, provider: "carga-prueba.test" })
          .toLowerCase(),
        phone: faker.phone.number({ style: "national" }),
        city: "CARGA",
        membership_status: faker.helpers.arrayElement([
          "miembro",
          "miembro",
          "asistente_habitual",
          "visitante",
        ] as const),
      };
    });
    people.push(...must(await supabase.from("people").insert(rows).select("id")));
  }
  console.log(`Personas creadas: ${people.length} (${ms(t)})`);
  const ids = people.map((p) => p.id);

  // 2. Servicio y check-ins individuales concurrentes (como gente llegando al culto)
  const today = new Date().toISOString().slice(0, 10);
  const service: { id: string } = must(
    await supabase
      .from("services")
      .insert({
        name: "CARGA — Culto",
        service_date: today,
        starts_at: new Date().toISOString(),
        checkin_opens_at: new Date(Date.now() - 3600_000).toISOString(),
        checkin_manual_state: "abierto",
      })
      .select("id")
      .single(),
  );
  const attendees = ids.slice(0, 1200);
  const latencies: number[] = [];
  let failures = 0;
  t = performance.now();
  await mapWithConcurrency(attendees, 50, async (personId) => {
    const s = performance.now();
    const { error } = await supabase
      .from("service_checkins")
      .insert({ service_id: service.id, person_id: personId, method: "qr" });
    latencies.push(performance.now() - s);
    if (error) failures++;
  });
  const elapsed = performance.now() - t;
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  check(
    "1200 check-ins (50 simultáneos)",
    `${Math.round(elapsed / 1000)} s total, ${Math.round(attendees.length / (elapsed / 1000))}/s, p95 ${Math.round(p95)} ms, ${failures} errores`,
    failures === 0,
  );

  // Check-in duplicado debe rechazarse
  const dup = await supabase
    .from("service_checkins")
    .insert({ service_id: service.id, person_id: attendees[0]!, method: "qr" });
  check("Check-in duplicado rechazado", dup.error ? "sí" : "NO", Boolean(dup.error));

  // 3. Ministerio, actividad y clase grandes
  const ministry: { id: string } = must(
    await supabase.from("ministries").insert({ name: "CARGA — Ministerio" }).select("id").single(),
  );
  const members = ids.slice(0, 1100);
  for (let i = 0; i < members.length; i += 500) {
    must(
      await supabase
        .from("ministry_memberships")
        .insert(members.slice(i, i + 500).map((p) => ({ ministry_id: ministry.id, person_id: p }))),
    );
  }
  const activity: { id: string } = must(
    await supabase
      .from("activities")
      .insert({ name: "CARGA — Actividad", activity_date: today, status: "realizada" })
      .select("id")
      .single(),
  );
  for (let i = 0; i < members.length; i += 500) {
    must(
      await supabase.from("activity_participants").insert(
        members.slice(i, i + 500).map((p, j) => ({
          activity_id: activity.id,
          person_id: p,
          attended: (i + j) % 2 === 0,
        })),
      ),
    );
  }
  const category: { id: string } = must(
    await supabase.from("course_categories").select("id").limit(1).single(),
  );
  const course: { id: string } = must(
    await supabase
      .from("courses")
      .insert({ category_id: category.id, name: "CARGA — Curso" })
      .select("id")
      .single(),
  );
  const offering: { id: string } = must(
    await supabase
      .from("class_offerings")
      .insert({ course_id: course.id, label: "CARGA — Clase", status: "activa" })
      .select("id")
      .single(),
  );
  const sessions = must(
    await supabase
      .from("class_sessions")
      .insert(
        ["2026-09-06", "2026-09-13", "2026-09-20"].map((d) => ({
          class_offering_id: offering.id,
          session_date: d,
        })),
      )
      .select("id"),
  );
  for (let i = 0; i < members.length; i += 500) {
    must(
      await supabase.from("enrollments").insert(
        members.slice(i, i + 500).map((p) => ({
          class_offering_id: offering.id,
          person_id: p,
          status: "en_progreso" as const,
        })),
      ),
    );
  }
  for (const s of sessions) {
    for (let i = 0; i < members.length; i += 500) {
      must(
        await supabase
          .from("attendance_records")
          .insert(
            members
              .slice(i, i + 500)
              .map((p) => ({ class_session_id: s.id, person_id: p, status: "presente" as const })),
          ),
      );
    }
  }
  console.log("Ministerio, actividad y clase con 1100 personas creados.");

  // 4. Verificación: consulta ingenua vs helpers nuevos
  const naive = await supabase.from("service_checkins").select("*").eq("service_id", service.id);
  check(
    "Consulta sin paginar (comportamiento anterior)",
    `devuelve ${naive.data?.length} de 1200`,
    true,
  );

  t = performance.now();
  const paged = await fetchAllPages((from, to) =>
    supabase
      .from("service_checkins")
      .select("*")
      .eq("service_id", service.id)
      .order("checked_in_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  check("Lista de check-ins paginada", `${paged.length} de 1200 (${ms(t)})`, paged.length === 1200);

  const bigIn = await supabase.from("people").select("id").in("id", attendees);
  check(
    ".in() con 1200 IDs (comportamiento anterior)",
    bigIn.error ? `falla: ${bigIn.error.message.slice(0, 60)}` : `devuelve ${bigIn.data?.length}`,
    true,
  );

  t = performance.now();
  const chunked = await fetchInChunks(attendees, (c) =>
    supabase.from("people").select("id, first_name, last_name").in("id", c),
  );
  check(
    "Nombres de 1200 personas en tandas",
    `${chunked.length} (${ms(t)})`,
    chunked.length === 1200,
  );

  const attendance = await fetchAllPages((from, to) =>
    supabase
      .from("attendance_records")
      .select("*")
      .in(
        "class_session_id",
        sessions.map((s) => s.id),
      )
      .order("id")
      .range(from, to),
  );
  check(
    "Asistencia de la clase (3×1100)",
    `${attendance.length} de 3300`,
    attendance.length === 3300,
  );

  const memberships = await fetchAllPages((from, to) =>
    supabase
      .from("ministry_memberships")
      .select("id, ministry_id")
      .is("left_at", null)
      .eq("ministry_id", ministry.id)
      .order("id")
      .range(from, to),
  );
  check("Miembros del ministerio", `${memberships.length} de 1100`, memberships.length === 1100);

  const [reg, att] = await Promise.all([
    supabase
      .from("activity_participants")
      .select("id", { count: "exact", head: true })
      .eq("activity_id", activity.id),
    supabase
      .from("activity_participants")
      .select("id", { count: "exact", head: true })
      .eq("activity_id", activity.id)
      .eq("attended", true),
  ]);
  check(
    "Conteo de actividad (reporte)",
    `${reg.count} inscritos / ${att.count} asistieron`,
    reg.count === 1100 && att.count === 550,
  );

  const { count: peopleCount } = await supabase
    .from("people")
    .select("id", { count: "exact", head: true });
  check("Conteo total de personas", `${peopleCount}`, (peopleCount ?? 0) >= PEOPLE);

  const picker = await fetchAllPages((from, to) =>
    supabase
      .rpc("list_people_for_ministry_picker")
      .order("last_name")
      .order("first_name")
      .order("id")
      .range(from, to),
  );
  // Con service_role is_staff() es falso, así que 0 es lo esperado aquí;
  // lo relevante es que .range() sobre el RPC no falle.
  check("Selector de personas (RPC paginado) sin error", `${picker.length} filas`, true);

  t = performance.now();
  const search = await supabase
    .from("people")
    .select("*", { count: "exact" })
    .or("first_name.ilike.%mar%,last_name.ilike.%mar%,email.ilike.%mar%,phone.ilike.%mar%")
    .order("last_name")
    .order("first_name")
    .range(0, 24);
  check(
    "Búsqueda en directorio ('mar')",
    `${search.count} resultados, página de ${search.data?.length} (${ms(t)})`,
    !search.error,
  );

  const failed = results.filter((r) => !r[2]);
  console.log(`\n${results.length - failed.length}/${results.length} verificaciones OK`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
