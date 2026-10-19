/**
 * Errores de las funciones del registro de personas (0054) a mensajes
 * para la UI. `COINCIDENCIAS` no es un error para el usuario: significa
 * "muestra las coincidencias antes de crear".
 */
export function isMatchesError(message: string | undefined): boolean {
  return Boolean(message?.startsWith("COINCIDENCIAS:"));
}

export function registryErrorMessage(
  error: { message: string; code?: string } | null,
  fallback: string,
): string {
  if (!error) return fallback;
  const m = error.message;
  if (m.startsWith("DATOS_INVALIDOS:")) return m.slice("DATOS_INVALIDOS:".length).trim();
  if (m.startsWith("DOS_CUENTAS:")) return m.slice("DOS_CUENTAS:".length).trim();
  if (error.code === "42501" || /No autorizado/.test(m)) {
    return "No tienes permiso para esta acción.";
  }
  if (/líder\/colíder del ministerio de intercesión/.test(m)) {
    return "Solo un administrador puede asignar líder o colíder en el ministerio de intercesión.";
  }
  return fallback;
}
