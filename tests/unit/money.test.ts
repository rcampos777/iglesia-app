import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToPlain, formatCents, parseAmountToCents } from "../../src/lib/money";

test("interpreta montos sin punto flotante", () => {
  assert.equal(parseAmountToCents("0.1"), 10);
  assert.equal(parseAmountToCents("0.29"), 29); // 0.29 * 100 = 28.999999999999996 en float
  assert.equal(parseAmountToCents("1,234.5"), 123450);
  assert.equal(parseAmountToCents("$ 20"), 2000);
  assert.equal(parseAmountToCents("1000000.00"), 100000000);
  for (const bad of ["", "0", "0.00", "-5", "1.234", "abc", "1,23.00", "1e3"]) {
    assert.equal(parseAmountToCents(bad), null, bad);
  }
});

test("formatea centavos exactos", () => {
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatCents(5), "$0.05");
  assert.equal(formatCents(123456789), "$1,234,567.89");
  assert.equal(formatCents("9007199254740991"), "$90,071,992,547,409.91");
  assert.equal(centsToPlain(123450), "1234.50");
  assert.equal(formatCents(10 + 20), "$0.30");
});
