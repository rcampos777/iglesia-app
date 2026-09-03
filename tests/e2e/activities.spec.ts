import { test, expect } from "@playwright/test";

/**
 * Smoke tests del módulo de actividades sin base de datos: verifican que
 * el guard de sesión protege las rutas. El flujo completo (crear,
 * inscribir, pasar lista, autorización por ministerio) se verifica
 * contra el proyecto sembrado — ver docs/testing.md.
 */

test.describe("Actividades — protección de rutas", () => {
  test("acceder a /actividades sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/actividades");
    await expect(page).toHaveURL(/\/login/);
  });

  test("acceder a /actividades/nueva sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/actividades/nueva");
    await expect(page).toHaveURL(/\/login/);
  });

  test("acceder al detalle de una actividad sin sesión redirige a /login", async ({ page }) => {
    await page.goto("/actividades/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });
});
