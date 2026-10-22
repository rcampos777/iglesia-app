import { z } from "zod";

/** Forma de contacto del sitio público. Correo o teléfono, al menos uno. */
export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe tu nombre.").max(120),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .refine((v) => v === "" || z.email().safeParse(v).success, "Escribe un correo válido."),
    phone: z
      .string()
      .trim()
      .max(30, "Teléfono demasiado largo.")
      .refine(
        (v) => v === "" || v.replace(/\D/g, "").length >= 7,
        "Escribe un número de teléfono válido.",
      ),
    message: z
      .string()
      .trim()
      .min(5, "Escribe tu mensaje.")
      .max(4000, "El mensaje es demasiado largo (máximo 4,000 caracteres)."),
  })
  .refine((d) => d.email !== "" || d.phone !== "", {
    message: "Déjanos un correo o un teléfono para responderte.",
    path: ["email"],
  });
