import { test, expect } from "@playwright/test";

/**
 * Registro central de personas (0054): las rutas nuevas exigen sesión.
 * Los flujos completos (coincidencias, importación, unificación,
 * vinculación con código) están cubiertos contra la base en
 * tests/db/person-registry.test.ts; recorrerlos aquí requiere cuentas de
 * prueba sembradas — ver docs/testing.md.
 */
const ID = "00000000-0000-0000-0000-000000000000";

for (const path of [
  "/personas/duplicados",
  `/personas/duplicados/unificar?a=${ID}&b=${ID}`,
  "/personas/vinculaciones",
  "/portal/vincular",
  `/ministerios/${ID}/importar`,
  `/ministerios/${ID}/importar/${ID}`,
]) {
  test(`${path} sin sesión redirige a /login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}
