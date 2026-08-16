import { z } from "zod";

export const membershipStatusValues = [
  "visitante",
  "asistente_habitual",
  "miembro",
  "inactivo",
] as const;

export const genderValues = ["masculino", "femenino", "no_especifica"] as const;

export const personSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es requerido.").max(100),
  lastName: z.string().trim().min(1, "El apellido es requerido.").max(100),
  preferredName: z.string().trim().max(100).optional().or(z.literal("")),
  birthDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  gender: z.enum(genderValues).optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido.").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  addressLine: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  maritalStatus: z.string().trim().max(50).optional().or(z.literal("")),
  membershipStatus: z.enum(membershipStatusValues),
  joinedAt: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type PersonInput = z.infer<typeof personSchema>;

export const personSearchSchema = z.object({
  q: z.string().trim().max(200).optional().or(z.literal("")),
  status: z.enum(membershipStatusValues).optional().or(z.literal("todos")),
});
