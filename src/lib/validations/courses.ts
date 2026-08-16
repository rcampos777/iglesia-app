import { z } from "zod";

export const classStatusValues = ["planificada", "activa", "completada", "cancelada"] as const;

export const courseCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "El código es requerido.")
    .max(50)
    .regex(/^[a-z0-9_]+$/, "Usa minúsculas, números y guion bajo solamente."),
  name: z.string().trim().min(1, "El nombre es requerido.").max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CourseCategoryInput = z.infer<typeof courseCategorySchema>;

export const courseSchema = z.object({
  categoryId: z.string().uuid("Selecciona una categoría."),
  name: z.string().trim().min(1, "El nombre es requerido.").max(150),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CourseInput = z.infer<typeof courseSchema>;

export const classOfferingSchema = z.object({
  courseId: z.string().uuid("Selecciona un curso."),
  label: z.string().trim().min(1, "El nombre de la clase es requerido.").max(150),
  teacherPersonId: z.string().uuid().optional().or(z.literal("")),
  location: z.string().trim().max(150).optional().or(z.literal("")),
  scheduleText: z.string().trim().max(150).optional().or(z.literal("")),
  startDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  endDate: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  capacity: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || (!Number.isNaN(Number(v)) && Number(v) > 0),
      "Debe ser un número positivo.",
    ),
  status: z.enum(classStatusValues),
});
export type ClassOfferingInput = z.infer<typeof classOfferingSchema>;

export const classSessionSchema = z.object({
  sessionDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  topic: z.string().trim().max(200).optional().or(z.literal("")),
});
export type ClassSessionInput = z.infer<typeof classSessionSchema>;
