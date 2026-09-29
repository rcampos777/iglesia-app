import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import { hasFinanceAccess } from "@/lib/auth/finance";

/** Cabeceras para documentos financieros: nunca en caché compartida. */
export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Rutas de descarga: sin acceso se responde 404 (no 403) para no revelar
 * si el documento existe. La base vuelve a validar en la consulta.
 */
export async function financeRouteAllowed(): Promise<boolean> {
  return hasFinanceAccess(await getCurrentUser());
}

export function notFoundResponse() {
  return new Response("No encontrado", { status: 404, headers: PRIVATE_HEADERS });
}
