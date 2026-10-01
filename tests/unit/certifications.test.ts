import { test } from "node:test";
import assert from "node:assert/strict";
import { certificationStatus } from "../../src/lib/certifications";

test("estado de una certificación según su vencimiento", () => {
  const today = "2026-10-01";
  assert.equal(certificationStatus(null, today), "sin_vencimiento");
  assert.equal(certificationStatus("2026-09-30", today), "vencida");
  assert.equal(certificationStatus("2026-10-01", today), "vence_pronto");
  assert.equal(certificationStatus("2026-10-31", today), "vence_pronto");
  assert.equal(certificationStatus("2026-11-01", today), "vigente");
});
