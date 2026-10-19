import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const pastDate = z
  .string()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida.")
  .refine((v) => !v || (v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10)), {
    message: "La fecha de nacimiento no puede ser futura.",
  });

/**
 * Datos mínimos para registrar a alguien desde cualquier módulo. Solo el
 * nombre es obligatorio: una visita no necesita más.
 */
export const quickPersonSchema = z.object({
  firstName: z.string().trim().min(1, "Escribe el nombre.").max(100),
  lastName: optionalText(100),
  email: z.string().trim().email("Correo inválido.").max(254).optional().or(z.literal("")),
  phone: optionalText(30),
  birthDate: pastDate,
});

export type QuickPersonInput = z.infer<typeof quickPersonSchema>;

export const requestKeySchema = z.string().uuid("Envío inválido. Recarga la página.");
export const acknowledgedSchema = z.array(z.string().uuid()).max(25);

/** Coincidencias a revisar en el formulario del directorio (ids separados por coma). */
export function parseAcknowledged(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw) return [];
  const parsed = acknowledgedSchema.safeParse(raw.split(",").filter(Boolean));
  return parsed.success ? parsed.data : [];
}

export function toPersonData(input: QuickPersonInput) {
  return {
    first_name: input.firstName,
    last_name: input.lastName || "",
    email: input.email || null,
    phone: input.phone || null,
    birth_date: input.birthDate || null,
  };
}

/** Fila de la lista que sube un ministerio (CSV). */
export const ministryImportRowSchema = z.object({
  row_number: z.number().int().min(1),
  first_name: z.string().trim().max(100),
  last_name: z.string().trim().max(100),
  email: z.string().trim().max(254),
  phone: z.string().trim().max(30),
  birth_date: z.string().trim().max(10),
  errors: z.array(z.string().max(200)).max(10),
});

export const ministryImportSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  rows: z.array(ministryImportRowSchema).min(1, "El archivo no tiene filas.").max(1000, {
    message: "Máximo 1,000 filas por archivo.",
  }),
});

export const claimStartSchema = z.object({
  phone: optionalText(30),
  birthDate: pastDate,
});

export const claimCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "El código tiene 6 dígitos.");

export const identityReviewSchema = z.object({
  phone: optionalText(30),
  birthDate: pastDate,
  note: optionalText(500),
});

export const mergeSchema = z.object({
  survivorId: z.string().uuid(),
  mergedId: z.string().uuid(),
  reason: z.string().trim().min(5, "Escribe el motivo (mínimo 5 caracteres).").max(300),
  takeFromMerged: z
    .array(
      z.enum([
        "first_name",
        "last_name",
        "preferred_name",
        "birth_date",
        "gender",
        "email",
        "phone",
        "address_line",
        "address_line2",
        "city",
        "postal_code",
        "country",
        "marital_status",
        "membership_status",
        "joined_at",
        "photo_url",
      ]),
    )
    .max(16),
});
