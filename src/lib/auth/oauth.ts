import type { User } from "@supabase/supabase-js";

export const OAUTH_PROVIDERS = ["google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/**
 * Proveedores con botón visible. Se encienden con AUTH_OAUTH_PROVIDERS
 * (p. ej. "google,apple") solo después de configurarlos en Supabase: sin
 * eso, el botón llevaría a un error "provider is not enabled".
 */
export function enabledOAuthProviders(): OAuthProvider[] {
  const raw = (process.env.AUTH_OAUTH_PROVIDERS ?? "").toLowerCase().split(",");
  return OAUTH_PROVIDERS.filter((p) => raw.map((s) => s.trim()).includes(p));
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Nombre sugerido para /completar-perfil. Solo Google: lo que manda Apple
 * no se usa (casi nunca llega y la persona debe escribirlo igual).
 */
export function googleNameDefaults(user: User): { firstName: string; lastName: string } {
  const data = user.identities?.find((i) => i.provider === "google")?.identity_data ?? {};
  const given = str(data.given_name);
  const family = str(data.family_name);
  if (given || family) return { firstName: given, lastName: family };

  const full = str(data.full_name) || str(data.name);
  const [first = "", ...rest] = full.split(/\s+/).filter(Boolean);
  return { firstName: first, lastName: rest.join(" ") };
}
