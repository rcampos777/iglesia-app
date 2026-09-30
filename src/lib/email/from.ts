/**
 * Remitente desde RESEND_FROM_EMAIL, tolerando cómo se suele pegar en el
 * panel de Vercel: comillas alrededor (rectas o curvas) y espacios o saltos
 * de línea. Resend rechaza el valor con cualquiera de esos restos.
 */
export function normalizeFromEmail(raw: string | undefined): string {
  const value = (raw ?? "")
    .trim()
    .replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, "")
    .trim();
  return value || "Iglesia <notificaciones@example.org>";
}
