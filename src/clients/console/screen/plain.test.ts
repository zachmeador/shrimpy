import assert from "node:assert/strict";
import { test } from "node:test";
import { lastLines, plain } from "./plain.ts";

const RLO = String.fromCharCode(0x202e);
const PDF = String.fromCharCode(0x202c);
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const ESC = "\u001b";
const BEL = "\u0007";
const ST = `${ESC}\\`;

test("text that is meant to be seen comes through as it is", () => {
  for (const text of ["hello", "two\nlines", "naïve café — 日本語 🦐", "  indented\n\n  and spaced  ", "", "a < b && c > d", "[31m is not a sequence"]) {
    assert.equal(plain(text), text);
  }
});

test("colors and styles are removed whole, so they can't leak into what follows", () => {
  assert.equal(plain(`${ESC}[31mred${ESC}[0m and ${ESC}[1;38;2;1;2;3mbold${ESC}[22m`), "red and bold");
});

test("the title, the clipboard and hyperlinks can't be set, whichever way the string ends", () => {
  assert.equal(plain(`${ESC}]0;pwned${BEL}after`), "after");
  assert.equal(plain(`${ESC}]2;pwned${ST}after`), "after");
  assert.equal(plain(`${ESC}]52;c;cHduZWQ=${BEL}`), "");
  assert.equal(plain(`${ESC}]8;;https://evil.example${BEL}a link${ESC}]8;;${BEL}`), "a link");
});

test("a carriage return can't overwrite what came before it: it is a line break", () => {
  assert.equal(plain("abc\rXYZ"), "abc\nXYZ");
  assert.equal(plain("line one\r\nline two"), "line one\nline two");
});

test("characters that reorder the text around them are dropped", () => {
  assert.equal(plain(`safe ${RLO}evil${PDF} ${LRI}x${PDI}`), "safe evil x");
});

/** What a terminal acts on or a reader can be misled by: control characters, and those that reorder text. */
const ACTED_ON = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]");

test("whatever comes in, nothing that a terminal would act on comes out", () => {
  const pieces = [ESC, "[", "]", "P", "_", "X", "^", "\\", BEL, "\u009b", "\u009d", "\u009c", "\r", "\n", "\t", "0", ";", "1", "m", "H", "J", "c", "6n", "abc", RLO, "é", "🦐"];
  let seed = 7;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed;
  };
  for (let round = 0; round < 3000; round++) {
    let text = "";
    for (let count = next() % 12; count > 0; count--) text += pieces[next() % pieces.length] ?? "";
    const made = plain(text);
    assert.doesNotMatch(made, ACTED_ON, JSON.stringify(text));
  }
});

test("a line of megabytes is cut to the last characters asked for, and the last lines of what is left", () => {
  assert.equal(lastLines("a".repeat(1_000_000), 5, 10), "a".repeat(10));
  assert.equal(lastLines("one\ntwo\nthree\nfour", 2, 12), "three\nfour");
  assert.equal(lastLines("a\nb\nc\nd\n", 2), "c\nd\n");
});
