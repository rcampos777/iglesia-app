import "server-only";

/**
 * Supabase (PostgREST) corta en silencio cualquier respuesta a 1000 filas
 * (`max_rows`), sin error. Estos helpers existen para que listas y
 * reportes sigan siendo correctos cuando la iglesia pasa de ~1000
 * personas/asistencias/inscripciones.
 */
export const PAGE_SIZE = 1000;

// PostgREST pone los filtros `.in(...)` en la URL; con cientos de UUIDs
// la URL supera el límite del gateway y la consulta falla.
const IN_CHUNK_SIZE = 150;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Trae todas las filas pidiendo páginas de PAGE_SIZE. La consulta debe tener un orden estable. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

/** Ejecuta un `.in(...)` en tandas para no generar URLs gigantes. */
export async function fetchInChunks<T>(
  ids: readonly string[],
  fetchChunk: (chunk: string[]) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + IN_CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await fetchChunk(chunk);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  );
  return results.flat();
}

/** Corre `fn` sobre cada elemento con un máximo de `limit` en paralelo. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}
