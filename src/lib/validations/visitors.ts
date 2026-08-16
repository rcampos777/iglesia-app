import { z } from "zod";

export const followupStatusValues = [
  "pendiente",
  "en_progreso",
  "completado",
  "no_contactable",
] as const;

export const createFollowUpSchema = z.object({
  personId: z.string().uuid("Selecciona una persona."),
  assignedTo: z.string().uuid().optional().or(z.literal("")),
  firstVisitDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  dueDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha inválida."),
});
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const followUpNoteSchema = z.object({
  note: z.string().trim().min(1, "Escribe una nota.").max(1000),
  contactMethod: z.string().trim().max(50).optional().or(z.literal("")),
});
export type FollowUpNoteInput = z.infer<typeof followUpNoteSchema>;
