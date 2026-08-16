/**
 * Sanitiza un término de búsqueda antes de interpolarlo en un filtro
 * `.or()`/`.ilike()` de PostgREST. `,` `(` `)` son metacaracteres del
 * mini-DSL de filtros de PostgREST (separan condiciones dentro de
 * `.or(...)`); si no se limpian, un usuario podría alterar la forma del
 * filtro (no saltarse RLS — Postgres la sigue aplicando siempre — pero sí
 * romper la consulta o ampliar/reducir de forma inesperada qué filas ya
 * visibles para él se listan). `%` y `*` son comodines de `ilike`.
 */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%*]/g, "").trim();
}
