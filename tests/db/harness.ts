/**
 * Postgres aislado en memoria (PGlite) para probar migraciones y RLS sin
 * Docker ni Supabase remoto. Emula lo mínimo de Supabase: esquema `auth`
 * (users + auth.uid() leyendo el claim de la sesión), roles
 * anon/authenticated/service_role y los grants por defecto de PostgREST.
 * pg_cron no existe aquí: la migración 0033 se omite.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "../../supabase/migrations");
const SKIP = new Set(["0033_schedule_service_generation.sql"]);

const PRELUDE = `
create schema if not exists extensions;
set search_path to public, extensions;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz default now(),
  raw_user_meta_data jsonb default '{}',
  raw_app_meta_data jsonb default '{}'
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { citext, pgcrypto } });
  await db.exec(PRELUDE);
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !SKIP.has(f))
    .sort();
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    } catch (err) {
      throw new Error(`La migración ${f} falló: ${(err as Error).message}`);
    }
  }
  await db.exec(`
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
  `);
  return db;
}

/** Ejecuta `fn` como un usuario autenticado (RLS activo) y vuelve a superusuario. */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Crea una cuenta sintética (el trigger crea persona + perfil + rol miembro). */
export async function createUser(db: PGlite, label: string, roles: string[] = []): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, jsonb_build_object('full_name', $2::text)) returning id`,
    [`${label}@example.test`, `Prueba ${label}`],
  );
  const id = rows[0]!.id;
  for (const role of roles) {
    await db.query(`insert into user_roles (user_id, role) values ($1, $2::app_role)`, [id, role]);
  }
  return id;
}

export async function personOf(db: PGlite, userId: string): Promise<string> {
  const { rows } = await db.query<{ person_id: string }>(
    `select person_id from profiles where id = $1`,
    [userId],
  );
  return rows[0]!.person_id;
}
