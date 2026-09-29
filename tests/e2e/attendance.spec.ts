import { test, expect } from "@playwright/test";

/**
 * Smoke tests de Asistencia que no requieren base de datos: el guard de
 * sesión protege las rutas. Permisos, ventana de registro, duplicados,
 * correcciones y revocación se prueban en tests/db/attendance.test.ts
 * (npm run test:db) — ver docs/testing.md.
 */

test.describe("Asistencia — protección de rutas", () => {
  for (const path of [
    "/check-in",
    "/check-in/programacion",
    "/check-in/publico",
    "/check-in/00000000-0000-0000-0000-000000000000",
  ]) {
    test(`acceder a ${path} sin sesión redirige a /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
