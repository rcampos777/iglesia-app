import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeId, slugify } from "../../src/lib/site/media";

test("reconoce enlaces de YouTube", () => {
  for (const u of [
    "dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ]) {
    assert.equal(parseYouTubeId(u), "dQw4w9WgXcQ", u);
  }
  for (const bad of [
    "",
    "https://vimeo.com/123",
    "https://youtube.com/watch?v=corto",
    "javascript:alert(1)",
  ]) {
    assert.equal(parseYouTubeId(bad), null, bad);
  }
});

test("slug sin acentos ni espacios", () => {
  assert.equal(slugify("Campamento de Jóvenes 2026!"), "campamento-de-jovenes-2026");
  assert.equal(slugify("  Ñandú   Único  "), "nandu-unico");
});
