import assert from "node:assert/strict";
import { test } from "node:test";
import { readFinalText } from "./ending.ts";

test("END counts when it is wrapped in whitespace, quotes, backticks or asterisks, or ends with a period, and so does nothing at all", () => {
  for (const form of ["END", " END ", '"END"', "“END”", "`END`", "**END**", "END.", " `END`. ", "", "\n\n"]) {
    assert.deepEqual(readFinalText(form), { kind: "silent" }, JSON.stringify(form));
  }
});

test("text that only mentions END, or says something near it, is a reply", () => {
  for (const text of ["END of story", "The END", "end", "END!", "ENDING"]) {
    assert.deepEqual(readFinalText(text), { kind: "reply", text }, JSON.stringify(text));
  }
});

test("text whose last line is END is posted without that line, and an END line before the last is left where it is", () => {
  assert.deepEqual(readFinalText("Done for today.\nEND"), { kind: "reply", text: "Done for today." });
  assert.deepEqual(readFinalText("Done for today.\n\n`END`.\n"), { kind: "reply", text: "Done for today." });
  assert.deepEqual(readFinalText("one\nEND\ntwo"), { kind: "reply", text: "one\nEND\ntwo" });
  assert.deepEqual(readFinalText("Hello\nEND\nEND"), { kind: "reply", text: "Hello\nEND" });
});

test("a reply is posted without the blank lines before it or the whitespace after it, and keeps its first line's indent", () => {
  assert.deepEqual(readFinalText("\n\nI'm working in the home.\n"), { kind: "reply", text: "I'm working in the home." });
  assert.deepEqual(readFinalText("  \n\t\r\n    indented code\nmore   \n\n"), { kind: "reply", text: "    indented code\nmore" });
});
