import { z } from "zod";
import { parseAmountToCents } from "@/lib/money";

const phone = z
  .string()
  .trim()
  .max(30, "Teléfono demasiado largo.")
  .refine((v) => v.replace(/\D/g, "").length >= 7, "Escribe un número de teléfono válido.");

const yesNo = z.enum(["si", "no"], { message: "Selecciona Sí o No." });

/** Forma pública de inscripción (sitio web). */
export const publicRegistrationSchema = z
  .object({
    firstName: z.string().trim().min(1, "Escribe tu nombre.").max(80),
    lastName: z.string().trim().min(1, "Escribe tus apellidos.").max(80),
    address: z.string().trim().min(5, "Escribe tu dirección física.").max(300),
    age: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Escribe tu edad en números.")
      .transform(Number)
      .refine((n) => n >= 18, "La inscripción en línea es para mayores de 18 años.")
      .refine((n) => n <= 120, "Edad inválida."),
    phone,
    email: z.string().trim().toLowerCase().email("Escribe un correo electrónico válido.").max(254),
    emergencyName: z.string().trim().min(3, "Escribe el nombre de un familiar.").max(150),
    emergencyPhone: phone,
    attendsChurch: yesNo,
    churchName: z.string().trim().max(150).optional().or(z.literal("")),
    hasMedicalCondition: yesNo,
    medicalDetails: z.string().trim().max(500).optional().or(z.literal("")),
    acceptTerms: z.literal("si", { message: "Debes aceptar las condiciones para inscribirte." }),
  })
  .refine((d) => d.attendsChurch === "no" || Boolean(d.churchName), {
    message: "Escribe el nombre de la iglesia.",
    path: ["churchName"],
  });
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;

const optionalMoney = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || v === "0" || parseAmountToCents(v) !== null, "Monto inválido.");

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Configuración de la inscripción en línea de una actividad. */
export const registrationSettingsSchema = z
  .object({
    registrationOpen: z.enum(["on"]).optional(),
    registrationSlug: z
      .string()
      .trim()
      .toLowerCase()
      .max(80)
      .refine((v) => !v || SLUG_RE.test(v), "Solo letras minúsculas, números y guiones.")
      .optional()
      .or(z.literal("")),
    registrationClosesOn: z.string().optional().or(z.literal("")),
    price: optionalMoney,
    deposit: optionalMoney,
    paymentInstructions: z.string().trim().max(2000).optional().or(z.literal("")),
    whatToBring: z.string().trim().max(2000).optional().or(z.literal("")),
    contactInfo: z.string().trim().max(500).optional().or(z.literal("")),
    confirmationMessage: z
      .string()
      .trim()
      .max(5000, "Máximo 5000 caracteres.")
      .optional()
      .or(z.literal("")),
    flyerMediaId: z.string().uuid().optional().or(z.literal("")),
    notifyEmails: z
      .string()
      .optional()
      .or(z.literal(""))
      .transform((v) =>
        (v ?? "")
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      )
      .refine((list) => list.length <= 5, "Máximo 5 correos.")
      .refine(
        (list) => list.every((e) => z.string().email().safeParse(e).success),
        "Hay un correo inválido.",
      ),
  })
  .refine((d) => !d.registrationOpen || Boolean(d.registrationSlug), {
    message: "Para abrir la inscripción necesitas una dirección (ej. retiro-hombres-2026).",
    path: ["registrationSlug"],
  })
  .refine(
    (d) => {
      const price = d.price ? (parseAmountToCents(d.price) ?? 0) : 0;
      const deposit = d.deposit ? (parseAmountToCents(d.deposit) ?? 0) : 0;
      return !d.price || deposit <= price;
    },
    { message: "El depósito no puede ser mayor que el costo.", path: ["deposit"] },
  );

export const registrationPaymentMethodValues = ["ath_movil", "efectivo", "cheque", "otro"] as const;

export const registrationPaymentSchema = z.object({
  amount: z
    .string()
    .trim()
    .refine((v) => parseAmountToCents(v) !== null, "Escribe un monto válido (ej. 50.00)."),
  method: z.enum(registrationPaymentMethodValues),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  reference: z.string().trim().max(100).optional().or(z.literal("")),
});
