import { z } from "zod";

export const activityStatusValues = ["planificada", "abierta", "realizada", "cancelada"] as const;

/** Centinela para "no pertenece a ningún ministerio" (Radix no admite value=""). */
export const NO_MINISTRY_VALUE = "__sin_ministerio__";

export const activitySchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es requerido.").max(150),
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    ministryId: z.string().uuid("Selecciona un ministerio válido.").optional().or(z.literal("")),
    activityDate: z
      .string()
      .min(1, "La fecha es requerida.")
      .refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida."),
    startTime: z.string().optional().or(z.literal("")),
    endTime: z.string().optional().or(z.literal("")),
    location: z.string().trim().max(150).optional().or(z.literal("")),
    capacity: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(
        (v) => !v || (/^\d+$/.test(v) && Number(v) > 0),
        "El cupo debe ser un número entero positivo.",
      ),
    responsiblePersonId: z.string().uuid().optional().or(z.literal("")),
    status: z.enum(activityStatusValues),
  })
  .refine((data) => !data.startTime || !data.endTime || data.endTime > data.startTime, {
    message: "La hora de fin debe ser posterior a la de inicio.",
    path: ["endTime"],
  });
export type ActivityInput = z.infer<typeof activitySchema>;

export const activityParticipantSchema = z.object({
  personId: z.string().uuid("Selecciona una persona."),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type ActivityParticipantInput = z.infer<typeof activityParticipantSchema>;
