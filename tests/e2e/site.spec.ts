import { test, expect } from "@playwright/test";

/**
 * Sitio público: se ve sin sesión, con o sin la base migrada (si falta
 * contenido, se muestra lo básico). El editor exige sesión. Permisos de
 * contenido: tests/db/site.test.ts.
 */
test.describe("Sitio web", () => {
  for (const path of ["/sitio", "/sitio/eventos", "/sitio/albumes", "/sitio/videos"]) {
    test(`${path} es público`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("el menú abre y cierra", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sitio");
    await page.getByRole("button", { name: "Abrir menú" }).click();
    const menu = page.getByRole("dialog", { name: "Menú" });
    await expect(menu.getByRole("link", { name: "Predicaciones" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  for (const path of ["/sitio-web", "/sitio-web/fotos", "/sitio-web/publicaciones"]) {
    test(`${path} sin sesión redirige a /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
