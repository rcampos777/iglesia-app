import { test, expect } from "@playwright/test";

/**
 * Estos smoke tests no requieren una base de datos real: solo verifican
 * que las páginas públicas renderizan y que el guard de sesión protege
 * el área autenticada. Las pruebas de flujo completo (login real,
 * CRUD, RLS) requieren un proyecto Supabase con datos sembrados por
 * `npm run seed` — ver docs/testing.md.
 */

test.describe("Páginas públicas", () => {
  test("la página de login muestra el formulario", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
  });

  test("la página de registro muestra el formulario", async ({ page }) => {
    await page.goto("/registro");
    await expect(page.getByRole("heading", { name: "Crear cuenta" })).toBeVisible();
    // Aviso de privacidad antes de crear la cuenta (0049).
    await expect(page.getByRole("checkbox", { name: /aviso de privacidad/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /aviso de privacidad completo/ })).toHaveAttribute(
      "href",
      "/sitio/privacidad",
    );
  });

  test("el aviso de privacidad es público", async ({ page }) => {
    await page.goto("/sitio/privacidad");
    await expect(
      page.getByRole("heading", { level: 1, name: "Aviso de privacidad" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tus derechos" })).toBeVisible();
  });

  test("la página de recuperar contraseña muestra el formulario", async ({ page }) => {
    await page.goto("/recuperar");
    await expect(page.getByRole("heading", { name: "Recuperar contraseña" })).toBeVisible();
  });
});

test.describe("Protección de rutas", () => {
  test("acceder a /dashboard sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("acceder a /personas sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/personas");
    await expect(page).toHaveURL(/\/login/);
  });

  test("acceder a /admin sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
