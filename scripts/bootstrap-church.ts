/**
 * Prepara el proyecto Supabase de una iglesia nueva con sus cuentas
 * iniciales (personas reales: nombre, email y roles). Idempotente: se
 * puede correr varias veces; no duplica cuentas ni roles.
 *
 * Las migraciones se aplican antes con `supabase db push` (ver
 * docs/deployment.md). La configuración vive en un JSON local que NUNCA
 * se commitea (`*.local.json` está en .gitignore); ver
 * church.example.json.
 *
 *   npx tsx --env-file=.env.production.local scripts/bootstrap-church.ts church.local.json
 *   ... --temp-passwords   # además genera contraseñas temporales en
 *                          # church-passwords.local.txt (sin SMTP aún)
 *
 * Sin --temp-passwords las cuentas quedan sin contraseña: cada persona
 * entra con "¿Olvidaste tu contraseña?" una vez configurado el SMTP
 * (Resend) del proyecto.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../src/types/database";

// Proyecto de demostración/desarrollo: aquí nunca van cuentas reales.
const DEMO_PROJECT_REFS = ["jlmabwnbtwjrtqaxfafx"];

const ROLES = [
  "miembro",
  "maestro",
  "seguimiento",
  "intercesor",
  "coordinador_ministerio",
  "pastor",
  "administrador",
] as const;

const configSchema = z.object({
  church: z.string().min(1),
  accounts: z
    .array(
      z.object({
        email: z.string().email(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        roles: z.array(z.enum(ROLES)).min(1),
      }),
    )
    .min(1)
    .refine((a) => a.some((x) => x.roles.includes("administrador")), {
      message: "Debe haber al menos un administrador.",
    }),
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
const tempPasswords = process.argv.includes("--temp-passwords");

if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
if (!configPath) throw new Error("Uso: bootstrap-church.ts <config.local.json>");
if (DEMO_PROJECT_REFS.some((ref) => url.includes(ref))) {
  throw new Error(
    "Ese es el proyecto de demostración; las cuentas reales van en su propio proyecto.",
  );
}

const config = configSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
const supabase = createClient<Database>(url, key, { auth: { persistSession: false } });

async function main() {
  console.log(`Preparando "${config.church}" en ${new URL(url!).host}`);

  const { error: schemaError } = await supabase.from("portal_invitations").select("id").limit(1);
  if (schemaError) {
    throw new Error(
      `Faltan migraciones (aplica 'supabase db push' primero): ${schemaError.message}`,
    );
  }

  const { data: existing, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) throw listError;

  const passwords: string[] = [];

  for (const account of config.accounts) {
    const email = account.email.toLowerCase();
    let user = existing.users.find((u) => u.email === email);

    if (!user) {
      const password = tempPasswords ? randomBytes(12).toString("base64url") : undefined;
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: account.firstName,
          last_name: account.lastName,
          full_name: `${account.firstName} ${account.lastName}`,
        },
      });
      if (error || !data.user) throw new Error(`No se pudo crear ${email}: ${error?.message}`);
      user = data.user;
      if (password) passwords.push(`${email}\t${password}`);
      console.log(`  + cuenta ${email}`);
    } else {
      console.log(`  = cuenta ${email} ya existía`);
    }

    // El trigger handle_new_auth_user crea la ficha en people.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("person_id")
      .eq("id", user.id)
      .single();
    if (profileError || !profile?.person_id) {
      throw new Error(`${email} no tiene ficha vinculada (revisa el trigger de perfiles).`);
    }
    const { error: personError } = await supabase
      .from("people")
      .update({ membership_status: "miembro" })
      .eq("id", profile.person_id);
    if (personError) throw new Error(`${email}: ${personError.message}`);

    const { error: rolesError } = await supabase.from("user_roles").upsert(
      account.roles.map((role) => ({ user_id: user.id, role })),
      { onConflict: "user_id,role" },
    );
    if (rolesError) throw new Error(`${email}: ${rolesError.message}`);
    console.log(`    roles: ${account.roles.join(", ")}`);
  }

  if (passwords.length) {
    writeFileSync("church-passwords.local.txt", passwords.join("\n") + "\n", { mode: 0o600 });
    console.log(
      "Contraseñas temporales guardadas en church-passwords.local.txt (no se muestran aquí). " +
        "Entrégalas en privado, pide que las cambien y borra el archivo.",
    );
  }
  console.log("Listo.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
