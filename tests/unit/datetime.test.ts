/**
 * Las fechas de la iglesia se ven igual sin importar la zona del
 * dispositivo o del servidor. Ejecutar con distintas TZ:
 *   TZ=Asia/Tokyo npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToDateKey,
  churchDateKey,
  formatChurchDate,
  formatChurchTime,
  formatDateKey,
  formatLocalTime,
} from "../../src/lib/datetime";

test("un culto dominical 9:30 a. m. PR (13:30 UTC) se muestra igual en cualquier zona", () => {
  const instant = "2026-10-04T13:30:00Z";
  assert.equal(formatChurchDate(instant), "Domingo, 4 de octubre");
  assert.match(formatChurchTime(instant), /^9:30\sa\.\s?m\.$/);
});

test("un culto de miércoles 7:30 p. m. PR (23:30 UTC) no se corre al jueves", () => {
  const instant = "2026-09-30T23:30:00Z";
  assert.equal(formatChurchDate(instant), "Miércoles, 30 de septiembre");
  assert.equal(churchDateKey(instant), "2026-09-30");
  assert.match(formatChurchTime(instant), /^7:30\sp\.\s?m\.$/);
});

test("'hoy' es la fecha de Puerto Rico", () => {
  assert.equal(churchDateKey("2026-10-01T03:59:00Z"), "2026-09-30");
  assert.equal(churchDateKey("2026-10-01T04:00:00Z"), "2026-10-01");
});

test("aritmética y formato de fechas locales", () => {
  assert.equal(addDaysToDateKey("2026-09-28", 28), "2026-10-26");
  assert.equal(addDaysToDateKey("2026-03-01", -1), "2026-02-28");
  assert.equal(formatDateKey("2026-10-04", false), "Domingo, 4 de octubre");
  assert.match(formatLocalTime("19:30:00"), /^7:30\sp\.\s?m\.$/);
});

test("fecha y hora de formularios en hora de Puerto Rico", async () => {
  const { prLocalInputToIso, isoToPrLocalInput } = await import("../../src/lib/datetime");
  assert.equal(prLocalInputToIso("2026-10-10T19:00"), "2026-10-10T23:00:00.000Z");
  assert.equal(isoToPrLocalInput("2026-10-10T23:00:00.000Z"), "2026-10-10T19:00");
  assert.equal(prLocalInputToIso("nada"), null);
});
