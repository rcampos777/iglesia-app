import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Traduce los errores de las funciones de asistencia (0032) a un mensaje
 * en español para la pantalla. Las funciones lanzan `CODIGO: mensaje`;
 * "No autorizado." (42501) cubre también un permiso revocado mientras la
 * pantalla seguía abierta.
 */
export function attendanceErrorMessage(error: Pick<PostgrestError, "code" | "message">): string {
  if (error.code === "42501" || /No autorizado/.test(error.message)) {
    return "No tienes permiso para esta acción. Si te lo acaban de quitar, recarga la página.";
  }
  const match = /^[A-Z_]+: ([\s\S]+)$/.exec(error.message);
  if (match?.[1]) return match[1];
  return "No se pudo completar la operación. Intenta de nuevo.";
}
