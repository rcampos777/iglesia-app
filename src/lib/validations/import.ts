import { z } from "zod";

/**
 * Esquema de una fila normalizada de importación. Todos los campos son
 * opcionales salvo nombre/apellido — el resto de errores de validación
 * (formato de fecha, email, etc.) se reportan por fila sin bloquear el
 * guardado en staging, para revisión humana.
 */
export const importedPersonSchema = z.object({
  first_name: z.string().trim().min(1, "Falta el nombre."),
  last_name: z.string().trim().min(1, "Falta el apellido."),
  email: z.string().trim().email("Email inválido.").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  birth_date: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha de nacimiento inválida."),
  gender: z.enum(["masculino", "femenino", "no_especifica"]).optional().or(z.literal("")),
  address_line: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  membership_status: z
    .enum(["visitante", "asistente_habitual", "miembro", "inactivo"])
    .optional()
    .or(z.literal("")),
});

export type ImportedPerson = z.infer<typeof importedPersonSchema>;

/**
 * Mapeo de encabezados de columna aceptados (en español, variantes
 * comunes) a los campos internos. Usado para normalizar archivos que no
 * siguen exactamente la plantilla recomendada (ver docs/import-process.md).
 */
export const COLUMN_ALIASES: Record<string, keyof ImportedPerson> = {
  nombre: "first_name",
  nombres: "first_name",
  first_name: "first_name",
  apellido: "last_name",
  apellidos: "last_name",
  last_name: "last_name",
  email: "email",
  correo: "email",
  "correo electrónico": "email",
  telefono: "phone",
  teléfono: "phone",
  celular: "phone",
  phone: "phone",
  "fecha de nacimiento": "birth_date",
  nacimiento: "birth_date",
  birth_date: "birth_date",
  genero: "gender",
  género: "gender",
  gender: "gender",
  direccion: "address_line",
  dirección: "address_line",
  address: "address_line",
  ciudad: "city",
  city: "city",
  estatus: "membership_status",
  estado: "membership_status",
  membership_status: "membership_status",
};

export function normalizeHeader(header: string): keyof ImportedPerson | null {
  const key = header.trim().toLowerCase();
  return COLUMN_ALIASES[key] ?? null;
}
