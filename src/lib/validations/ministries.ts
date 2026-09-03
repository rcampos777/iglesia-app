import { z } from "zod";

/**
 * Radix Select no admite un item con value="" (lo reserva para "sin
 * selección"), así que "sin líder" viaja con este centinela y se
 * normaliza a "" antes de validar.
 */
export const NO_LEADER_VALUE = "__sin_lider__";

export const ministryMemberRoleValues = ["lider", "colider", "miembro"] as const;

export const ministrySchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido.").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  leaderPersonId: z.string().uuid("Selecciona una persona válida.").optional().or(z.literal("")),
  meetingScheduleText: z.string().trim().max(150).optional().or(z.literal("")),
  location: z.string().trim().max(150).optional().or(z.literal("")),
  isActive: z.union([z.literal("true"), z.literal("false")]).default("true"),
  grantsPrayerAccess: z.union([z.literal("true"), z.literal("false")]).default("false"),
});
export type MinistryInput = z.infer<typeof ministrySchema>;

export const ministryMembershipSchema = z.object({
  personId: z.string().uuid("Selecciona una persona."),
  roleInMinistry: z.enum(ministryMemberRoleValues),
  joinedAt: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type MinistryMembershipInput = z.infer<typeof ministryMembershipSchema>;
