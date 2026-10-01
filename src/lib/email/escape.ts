/** Escapa texto para insertarlo en el HTML de un email. */
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Texto libre con saltos de línea → HTML seguro. */
export function para(text: string): string {
  return esc(text).replace(/\n/g, "<br>");
}
