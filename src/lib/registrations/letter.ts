/**
 * Personaliza la carta de bienvenida: `{{Nombre}}` (sin importar
 * mayúsculas ni espacios dentro de las llaves) → nombre de la persona.
 * Devuelve texto plano; quien lo muestre en HTML debe escaparlo.
 */
export function personalizeLetter(template: string, firstName: string): string {
  return template.replace(/\{\{\s*nombre\s*\}\}/gi, firstName.trim());
}
