/**
 * Genera datos SINTÉTICOS de desarrollo. Nunca usar con un proyecto
 * Supabase de producción — este script usa la service_role key y omite
 * RLS a propósito.
 *
 * Uso:
 *   cp .env.example .env.local   # completar con un proyecto de DESARROLLO
 *   npm run seed
 *
 * Requiere ALLOW_SEED=true (o NEXT_PUBLIC_APP_ENV=development) como
 * salvaguarda mínima contra ejecutarlo por accidente en producción.
 */
import { createClient } from "@supabase/supabase-js";
import { faker } from "@faker-js/faker/locale/es";
import type { Database, AppRole, MembershipStatus } from "../src/types/database";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? "development";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local. " +
      "Copia .env.example y completa un proyecto Supabase de DESARROLLO.",
  );
  process.exit(1);
}

if (APP_ENV === "production" && process.env.ALLOW_SEED !== "true") {
  console.error(
    "NEXT_PUBLIC_APP_ENV=production: me niego a sembrar datos sintéticos. " +
      "Si de verdad quieres hacerlo (no recomendado), exporta ALLOW_SEED=true.",
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_PASSWORD = "Iglesia2026!Dev";

interface SeedAccount {
  email: string;
  firstName: string;
  lastName: string;
  roles: AppRole[];
}

const SEED_ACCOUNTS: SeedAccount[] = [
  {
    email: "admin@iglesia.test",
    firstName: "Ana",
    lastName: "Administradora",
    roles: ["administrador"],
  },
  { email: "pastor@iglesia.test", firstName: "Pedro", lastName: "Pastor", roles: ["pastor"] },
  {
    email: "coordinador@iglesia.test",
    firstName: "Carla",
    lastName: "Coordinadora",
    roles: ["coordinador_ministerio"],
  },
  { email: "maestro@iglesia.test", firstName: "Miguel", lastName: "Maestro", roles: ["maestro"] },
  {
    email: "seguimiento@iglesia.test",
    firstName: "Sofía",
    lastName: "Seguimiento",
    roles: ["seguimiento"],
  },
  {
    email: "intercesor@iglesia.test",
    firstName: "Ismael",
    lastName: "Intercesor",
    roles: ["intercesor"],
  },
  { email: "miembro@iglesia.test", firstName: "Marta", lastName: "Miembro", roles: ["miembro"] },
];

async function upsertSeedAccount(
  account: SeedAccount,
): Promise<{ userId: string; personId: string }> {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === account.email);

  let userId: string;

  if (found) {
    userId = found.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: account.firstName, last_name: account.lastName },
    });
    if (error || !data.user)
      throw new Error(`No se pudo crear ${account.email}: ${error?.message}`);
    userId = data.user.id;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    throw new Error(
      `No se creó automáticamente el profile de ${account.email} (revisa el trigger).`,
    );
  }

  for (const role of account.roles) {
    await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
  }

  return { userId, personId: profile.person_id };
}

const MEMBERSHIP_WEIGHTS: MembershipStatus[] = [
  "miembro",
  "miembro",
  "miembro",
  "asistente_habitual",
  "asistente_habitual",
  "visitante",
  "inactivo",
];

function randomPerson() {
  const gender = faker.helpers.arrayElement(["masculino", "femenino"] as const);
  const firstName = faker.person.firstName(gender === "masculino" ? "male" : "female");
  const lastName = faker.person.lastName();
  return {
    first_name: firstName,
    last_name: lastName,
    gender,
    email: faker.internet
      .email({ firstName, lastName, provider: "correo-ejemplo.test" })
      .toLowerCase(),
    phone: faker.phone.number({ style: "national" }),
    birth_date: faker.date.birthdate({ min: 5, max: 85, mode: "age" }).toISOString().slice(0, 10),
    address_line: faker.location.streetAddress(),
    city: faker.location.city(),
    membership_status: faker.helpers.arrayElement(MEMBERSHIP_WEIGHTS),
  };
}

async function seedPeople(count: number) {
  const rows = Array.from({ length: count }, randomPerson);
  const { data, error } = await supabase
    .from("people")
    .insert(rows)
    .select("id, membership_status");
  if (error) throw new Error(`No se pudieron crear personas sintéticas: ${error.message}`);
  console.log(`  ${data?.length ?? 0} personas sintéticas creadas.`);
  return data ?? [];
}

async function seedCoursesAndClasses(teacherPersonId: string) {
  const { data: categories, error: catError } = await supabase
    .from("course_categories")
    .select("id, code");
  if (catError) throw new Error(catError.message);

  const byCode = new Map((categories ?? []).map((c) => [c.code, c.id]));

  const coursesToCreate = [
    { code: "nuevos_convertidos", name: "Discipulado I" },
    { code: "liderazgo", name: "Escuela de líderes" },
    { code: "hombres", name: "Hombres conforme al corazón de Dios" },
  ];

  const createdOfferings: string[] = [];

  for (const c of coursesToCreate) {
    const categoryId = byCode.get(c.code);
    if (!categoryId) continue;

    const { data: course, error: courseError } = await supabase
      .from("courses")
      .insert({
        category_id: categoryId,
        name: c.name,
        description: `${c.name} (datos sintéticos)`,
      })
      .select("id")
      .single();
    if (courseError || !course) throw new Error(courseError?.message ?? "curso no creado");

    const { data: offering, error: offeringError } = await supabase
      .from("class_offerings")
      .insert({
        course_id: course.id,
        label: `${c.name} — Ciclo 2026`,
        teacher_person_id: teacherPersonId,
        location: "Salón principal",
        schedule_text: "Domingos 9:00am",
        start_date: "2026-01-11",
        end_date: "2026-03-29",
        status: "activa",
      })
      .select("id")
      .single();
    if (offeringError || !offering) throw new Error(offeringError?.message ?? "clase no creada");

    createdOfferings.push(offering.id);

    const sessionDates = ["2026-01-11", "2026-01-18", "2026-01-25", "2026-02-01"];
    await supabase
      .from("class_sessions")
      .insert(sessionDates.map((d) => ({ class_offering_id: offering.id, session_date: d })));
  }

  console.log(`  ${createdOfferings.length} clases con sesiones creadas.`);
  return createdOfferings;
}

async function seedEnrollmentsAndAttendance(offeringIds: string[], peopleIds: string[]) {
  for (const offeringId of offeringIds) {
    const students = faker.helpers.arrayElements(peopleIds, Math.min(8, peopleIds.length));

    const { error: enrollError } = await supabase.from("enrollments").insert(
      students.map((personId) => ({
        class_offering_id: offeringId,
        person_id: personId,
        status: "en_progreso" as const,
      })),
    );
    if (enrollError) throw new Error(enrollError.message);

    const { data: sessions } = await supabase
      .from("class_sessions")
      .select("id")
      .eq("class_offering_id", offeringId);

    for (const session of sessions ?? []) {
      await supabase.from("attendance_records").insert(
        students.map((personId) => ({
          class_session_id: session.id,
          person_id: personId,
          status: faker.helpers.weightedArrayElement([
            { value: "presente" as const, weight: 7 },
            { value: "ausente" as const, weight: 2 },
            { value: "tarde" as const, weight: 1 },
          ]),
        })),
      );
    }
  }
  console.log("  Matrícula y asistencia sintéticas creadas.");
}

async function seedServicesAndCheckins(peopleIds: string[]) {
  const { data: service, error } = await supabase
    .from("services")
    .insert({
      name: "Culto dominical",
      service_type: "culto_general",
      service_date: new Date().toISOString().slice(0, 10),
      start_time: "10:00",
      is_checkin_open: true,
    })
    .select("id")
    .single();
  if (error || !service) throw new Error(error?.message ?? "servicio no creado");

  const attendees = faker.helpers.arrayElements(peopleIds, Math.min(15, peopleIds.length));
  await supabase.from("service_checkins").insert(
    attendees.map((personId) => ({
      service_id: service.id,
      person_id: personId,
      method: "manual" as const,
    })),
  );

  console.log(`  1 servicio con ${attendees.length} check-ins sintéticos.`);
}

async function seedVisitorFollowUps(
  peopleIds: { id: string; membership_status: MembershipStatus }[],
  staffUserId: string,
) {
  const visitors = peopleIds.filter((p) => p.membership_status === "visitante");
  if (visitors.length === 0) return;

  await supabase.from("visitor_follow_ups").insert(
    visitors.map((v) => ({
      person_id: v.id,
      assigned_to: staffUserId,
      status: faker.helpers.arrayElement(["pendiente", "en_progreso", "completado"] as const),
      first_visit_date: faker.date.recent({ days: 30 }).toISOString().slice(0, 10),
    })),
  );
  console.log(`  ${visitors.length} seguimientos de visitantes creados.`);
}

async function seedPrayerRequests(memberUserId: string, memberPersonId: string) {
  const genericRequests = [
    "Petición por sanidad física para un familiar.",
    "Petición por provisión económica y un nuevo empleo.",
    "Petición por restauración de una relación familiar.",
    "Acción de gracias por una respuesta reciente.",
  ];

  await supabase.from("prayer_requests").insert(
    genericRequests.map((content) => ({
      requester_person_id: memberPersonId,
      submitted_by_user_id: memberUserId,
      is_anonymous: false,
      content,
      urgency: "normal" as const,
    })),
  );
  console.log(`  ${genericRequests.length} peticiones de oración sintéticas creadas.`);
}

/**
 * Ministerios sintéticos con su gente. Los nombres de los ministerios
 * son genéricos de cualquier iglesia (no datos reales de ninguna), y
 * las personas asignadas salen del generador sintético.
 */
async function seedMinistries(peopleIds: string[], coordinatorPersonId: string) {
  const definitions = [
    {
      name: "Alabanza",
      description: "Equipo de música y adoración.",
      schedule: "Jueves 7:00 p.m.",
    },
    {
      name: "Ujieres",
      description: "Recibimiento y orden en los servicios.",
      schedule: "Domingos 9:00 a.m.",
    },
    {
      name: "Ministerio de niños",
      description: "Enseñanza y cuidado de los niños.",
      schedule: "Domingos 10:00 a.m.",
    },
    {
      name: "Intercesión",
      description: "Equipo de oración de la iglesia.",
      schedule: "Martes 6:00 p.m.",
    },
    {
      name: "Medios",
      description: "Sonido, proyección y transmisión.",
      schedule: "Domingos 8:30 a.m.",
    },
  ];

  const { data: ministries, error } = await supabase
    .from("ministries")
    .insert(
      definitions.map((d, i) => ({
        name: d.name,
        description: d.description,
        meeting_schedule_text: d.schedule,
        // El coordinador de prueba lidera el primero, para poder
        // verificar en vivo la autorización por ámbito (líder gestiona
        // su propio ministerio sin ser administrador).
        leader_person_id: i === 0 ? coordinatorPersonId : null,
        is_active: true,
      })),
    )
    .select("id, name");

  if (error) throw error;
  if (!ministries) return;

  const memberships: {
    ministry_id: string;
    person_id: string;
    role_in_ministry: "lider" | "colider" | "miembro";
    joined_at: string;
  }[] = [];

  for (const ministry of ministries) {
    const team = faker.helpers.arrayElements(peopleIds, faker.number.int({ min: 3, max: 7 }));
    team.forEach((personId, index) => {
      memberships.push({
        ministry_id: ministry.id,
        person_id: personId,
        role_in_ministry: index === 0 ? "lider" : index === 1 ? "colider" : "miembro",
        joined_at: faker.date.past({ years: 2 }).toISOString().slice(0, 10),
      });
    });
  }

  const { error: membershipError } = await supabase
    .from("ministry_memberships")
    .insert(memberships);
  if (membershipError) throw membershipError;

  console.log(`  ${ministries.length} ministerios con ${memberships.length} personas sirviendo.`);
}

async function main() {
  console.log(`Sembrando datos sintéticos en ${SUPABASE_URL} (ambiente: ${APP_ENV})...`);
  console.log("\n1. Cuentas de prueba por rol:");

  const accountResults: Record<string, { userId: string; personId: string }> = {};
  for (const account of SEED_ACCOUNTS) {
    const result = await upsertSeedAccount(account);
    accountResults[account.email] = result;
    console.log(`  ${account.email} (${account.roles.join(", ")}) — contraseña: ${TEST_PASSWORD}`);
  }

  console.log("\n2. Personas sintéticas:");
  const people = await seedPeople(40);
  const peopleIds = people.map((p) => p.id);

  console.log("\n3. Cursos y clases:");
  const teacherPersonId = accountResults["maestro@iglesia.test"]!.personId;
  const offeringIds = await seedCoursesAndClasses(teacherPersonId);

  console.log("\n4. Matrícula y asistencia:");
  await seedEnrollmentsAndAttendance(offeringIds, peopleIds);

  console.log("\n5. Servicio y check-ins:");
  await seedServicesAndCheckins(peopleIds);

  console.log("\n6. Seguimiento de visitantes:");
  await seedVisitorFollowUps(people, accountResults["seguimiento@iglesia.test"]!.userId);

  console.log("\n7. Peticiones de oración:");
  await seedPrayerRequests(
    accountResults["miembro@iglesia.test"]!.userId,
    accountResults["miembro@iglesia.test"]!.personId,
  );

  console.log("\n8. Ministerios:");
  await seedMinistries(peopleIds, accountResults["coordinador@iglesia.test"]!.personId);

  console.log("\nListo. Todos los datos son sintéticos — ninguno corresponde a personas reales.");
}

main().catch((err) => {
  console.error("\nError al sembrar datos:", err);
  process.exit(1);
});
