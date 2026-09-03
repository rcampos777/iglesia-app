import { test, expect } from "@playwright/test";

/**
 * Smoke tests del módulo de ministerios que no requieren base de datos:
 * verifican que el guard de sesión protege las rutas nuevas. Las
 * pruebas de flujo completo (crear ministerio, agregar personas,
 * autorización de líder) requieren un proyecto Supabase sembrado — ver
 * docs/testing.md.
 */

test.describe("Ministerios — protección de rutas", () => {
  test("acceder a /ministerios sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/ministerios");
    await expect(page).toHaveURL(/\/login/);
  });

  test("acceder a /ministerios/nuevo sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/ministerios/nuevo");
    await expect(page).toHaveURL(/\/login/);
  });

  test("acceder al detalle de un ministerio sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/ministerios/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });
});
