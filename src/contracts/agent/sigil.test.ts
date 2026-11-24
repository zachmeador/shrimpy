import assert from "node:assert/strict";
import { test } from "node:test";
import { lookFromId, makeSigil, parseSigil, PIGMENTS, pickPigment } from "./index.ts";

/*
 * A sigil is made from the random numbers it is handed and nothing else. A new home gets one made from Math.random,
 * and every client that works one out from a member's ID has to draw the same one.
 */

/** Numbers from 0 up to 1, the same for the same seed. */
function numbers(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

test("a made sigil is twelve by twelve, the same left to right, and neither nearly empty nor nearly full", () => {
  // Sources that give the same number every time, or numbers outside 0 up to 1, make one too.
  const sources = [...Array.from({ length: 500 }, (_, seed) => numbers(seed)), () => 0, () => 0.999, () => 1, () => -3, () => Number.NaN];
  for (const random of sources) {
    const sigil = makeSigil(random);
    assert.deepEqual(parseSigil(sigil), sigil);
    for (const line of sigil) assert.equal(line, Array.from(line).reverse().join(""), sigil.join("\n"));
    const on = sigil.join("").replaceAll(".", "").length;
    assert.ok(on >= 144 / 5 && on <= (144 * 2) / 3, `${String(on)} of 144 cells are on:\n${sigil.join("\n")}`);
  }
});

test("the same numbers make the same look, so every client works out the same one from a member's ID", () => {
  assert.deepEqual(makeSigil(numbers(7)), makeSigil(numbers(7)));
  assert.equal(pickPigment(numbers(7)), pickPigment(numbers(7)));
  assert.deepEqual(lookFromId("mem_4k9x2m7q0b3d"), lookFromId("mem_4k9x2m7q0b3d"));
  const looks = Array.from({ length: 20 }, (_, index) => lookFromId(`mem_${String(index)}`));
  assert.ok(looks.every(({ pigment }) => PIGMENTS.includes(pigment)));
  assert.ok(new Set(looks.map(({ sigil }) => sigil.join(""))).size > 15, "and other IDs mostly look different");
});
