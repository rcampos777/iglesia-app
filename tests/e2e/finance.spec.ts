import { test, expect } from "@playwright/test";

/**
 * Smoke tests de Finanzas que no requieren base de datos: sin sesión,
 * ninguna página, PDF ni exportación entrega contenido. Los permisos por
 * rol (apóstol, finanzas, administrador, pastor, ujier, miembro,
 * intercesor), la oración del sobre y las cartas se prueban en
 * tests/db/finance.test.ts (npm run test:db).
 */

const ID = "00000000-0000-4000-8000-000000000000";

test.describe("Finanzas — protección de rutas", () => {
  for (const path of [
    "/finanzas",
    "/finanzas/nueva",
    `/finanzas/${ID}`,
    `/finanzas/donantes/${ID}`,
    "/finanzas/cartas",
    "/finanzas/configuracion",
    "/finanzas/acceso",
  ]) {
    test(`${path} sin sesión redirige a /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  for (const path of [
    `/finanzas/cartas/${ID}/pdf`,
    `/finanzas/cartas/vista-previa?persona=${ID}&desde=2025-01-01&hasta=2025-12-31`,
    "/finanzas/exportar",
  ]) {
    test(`descarga directa ${path.split("?")[0]} sin sesión no entrega el archivo`, async ({
      request,
    }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([302, 303, 307, 308, 404]).toContain(res.status());
      const type = res.headers()["content-type"] ?? "";
      expect(type).not.toContain("application/pdf");
      expect(type).not.toContain("text/csv");
    });
  }
});
