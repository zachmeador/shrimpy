import assert from "node:assert/strict";
import { test } from "node:test";
import { lastLines, oneLine, plain } from "./plain.ts";

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
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
  assert.equal(plain(`${ESC}[38:5:196mcolon form${ESC}[m`), "colon form");
});

test("moving the cursor, clearing the screen and asking the terminal things do nothing", () => {
  assert.equal(plain(`up${ESC}[2A${ESC}[2K${ESC}[Hhome${ESC}[2J${ESC}[3J${ESC}[?25l${ESC}[?1049h`), "uphome");
  assert.equal(plain(`${ESC}[6n${ESC}[c${ESC}[>q${ESC}[0 q${ESC}[5;10r`), "");
  assert.equal(plain(`${ESC}c${ESC}7${ESC}8${ESC}=${ESC}>${ESC}M${ESC}(B`), "");
});

test("the title, the clipboard and hyperlinks can't be set, whichever way the string ends", () => {
  assert.equal(plain(`${ESC}]0;pwned${BEL}after`), "after");
  assert.equal(plain(`${ESC}]2;pwned${ST}after`), "after");
  assert.equal(plain(`${ESC}]52;c;cHduZWQ=${BEL}`), "");
  assert.equal(plain(`${ESC}]8;;https://evil.example${BEL}a link${ESC}]8;;${BEL}`), "a link");
  assert.equal(plain(`${ESC}]8;;https://evil.example${ST}a link${ESC}]8;;${ST}`), "a link");
});

test("device control, application commands and images are removed", () => {
  assert.equal(plain(`${ESC}P1$r0m${ST}x`), "x");
  assert.equal(plain(`${ESC}_Gi=1,a=T,f=100;AAAA${ST}x`), "x");
  assert.equal(plain(`${ESC}^private${ST}${ESC}Xstring${ST}x`), "x");
  // A string wrapped for tmux has an escape inside it, which ends it early: what is left is only text.
  assert.equal(plain(`${ESC}Ptmux;${ESC}${ESC}[2J${ESC}\\x`), "tmux;x");
});

test("the 8-bit forms are removed too", () => {
  assert.equal(plain("\u009b31mred\u009b0m"), "red");
  assert.equal(plain("\u009d0;pwned\u0007after"), "after");
  assert.equal(plain("\u0090q\u009cx"), "x");
});

test("what a sequence that never ends leaves is only text", () => {
  assert.equal(plain(`${ESC}]0;never ends`), "0;never ends");
  assert.equal(plain(`${ESC}[31`), "31");
  assert.equal(plain(`text${ESC}`), "text");
});

test("a bell, a backspace and the other control characters are dropped", () => {
  assert.equal(plain(`a${BEL}b\u0008c\u0000d\u007fe\u0005f\u000bg\u000ch`), "abcdefgh");
});

test("a carriage return can't overwrite what came before it: it is a line break", () => {
  assert.equal(plain("abc\rXYZ"), "abc\nXYZ");
  assert.equal(plain("line one\r\nline two"), "line one\nline two");
  assert.equal(plain("progress 10%\rprogress 100%\n"), "progress 10%\nprogress 100%\n");
});

test("a tab is spaces, and the Unicode line separators are line breaks", () => {
  assert.equal(plain("a\tb"), "a   b");
  assert.equal(plain(`a${LS}b${PS}c`), "a\nb\nc");
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

test("on one line, the breaks become spaces and the ends are trimmed", () => {
  assert.equal(oneLine("  first\n  second \r\n third  "), "first second third");
  assert.equal(oneLine(`${ESC}[31mred${ESC}[0m\n`), "red");
});

test("the last lines of a text, however long, with its final break not counting as a line", () => {
  assert.equal(lastLines("a\nb\nc\nd", 2), "c\nd");
  assert.equal(lastLines("a\nb\nc\nd\n", 2), "c\nd\n");
  assert.equal(lastLines("a\nb", 5), "a\nb");
  assert.equal(lastLines("only", 1), "only");
  assert.equal(lastLines("", 3), "");
  assert.equal(lastLines("\n\nx", 1), "x");
});

test("a line of megabytes is cut to the last characters asked for, and the last lines of what is left", () => {
  assert.equal(lastLines("a".repeat(1_000_000), 5, 10), "a".repeat(10));
  assert.equal(lastLines("one\ntwo\nthree\nfour", 2, 12), "three\nfour");
  assert.equal(lastLines("one\ntwo\nthree\nfour", 3, 12), "o\nthree\nfour");
  assert.equal(lastLines("short", 3, 100), "short");
});
