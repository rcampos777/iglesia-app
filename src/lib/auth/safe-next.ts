/**
 * Valida el destino `next` de los enlaces de email. Solo rutas internas:
 * sin esto, `next=@evil.com` o `next=//evil.com` convertiría el enlace
 * en una redirección abierta hacia otro sitio.
 */
export function safeNext(next: string | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
