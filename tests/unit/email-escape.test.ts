import { test } from "node:test";
import assert from "node:assert/strict";
import { para } from "../../src/lib/email/escape";

test("el texto libre de un email no puede inyectar HTML", () => {
  assert.equal(
    para('Hola <a href="https://malo.example">clic</a>\n& adiós'),
    "Hola &lt;a href=&quot;https://malo.example&quot;&gt;clic&lt;/a&gt;<br>&amp; adiós",
  );
});
