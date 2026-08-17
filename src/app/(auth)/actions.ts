"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

function zodFieldErrors(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}) {
  const { fieldErrors } = error.flatten();
  const clean: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (value) clean[key] = value;
  }
  return clean;
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return actionError("Email o contraseña incorrectos.");
  }

  revalidatePath("/", "layout");

  const next = formData.get("next");
  // Solo redirigir a rutas internas relativas — nunca a una URL externa.
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  redirect(safeNext);
}

export async function registerAction(formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        full_name: `${parsed.data.firstName} ${parsed.data.lastName}`,
      },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return actionError("Ya existe una cuenta con ese email.");
    }
    return actionError("No se pudo crear la cuenta. Intenta de nuevo.");
  }

  return actionOk(undefined);
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/recuperar/nueva-contrasena`,
  });

  // Siempre respondemos "ok" exista o no la cuenta, para no filtrar qué
  // emails están registrados.
  return actionOk(undefined);
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return actionError("Revisa los datos ingresados.", zodFieldErrors(parsed.error));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return actionError("No se pudo actualizar la contraseña. Solicita un nuevo enlace.");
  }

  redirect("/login?reset=ok");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
