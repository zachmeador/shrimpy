import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, inParts, isEnd, readFinalText, replyRequestId } from "./reply.ts";

test("END counts when it is wrapped in whitespace, quotes, backticks or asterisks, or ends with a period", () => {
  const forms = [
    "END",
    " END ",
    "\nEND\n",
    "\t END \n\n",
    '"END"',
    "'END'",
    "“END”",
    "‘END’",
    "`END`",
    "```END```",
    "*END*",
    "**END**",
    "END.",
    '"END".',
    '"END."',
    "**END.**",
    " `END`. ",
    "***`END`***",
  ];
  for (const form of forms) {
    assert.deepEqual(readFinalText(form), { kind: "silent" }, JSON.stringify(form));
    assert.equal(isEnd(form.trim()), true, JSON.stringify(form));
  }
});

test("nothing at all counts as having nothing to say", () => {
  for (const text of ["", " ", "\n\n", " \t\n "]) {
    assert.deepEqual(readFinalText(text), { kind: "silent" }, JSON.stringify(text));
  }
});

test("text that only mentions END, or says something near it, is a reply", () => {
  const replies = [
    "END of story",
    "The END",
    "I will say END when I am done.",
    "end",
    "End",
    "END!",
    "END..",
    "ENDING",
    "E N D",
    ".END",
    "END END",
    "THE END.",
    "-END-",
  ];
  for (const text of replies) {
    assert.deepEqual(readFinalText(text), { kind: "reply", text }, JSON.stringify(text));
  }
});

test("text whose last line is END is posted without that line", () => {
  assert.deepEqual(readFinalText("Done for today.\nEND"), { kind: "reply", text: "Done for today." });
  assert.deepEqual(readFinalText("Done for today.\n\n`END`.\n"), { kind: "reply", text: "Done for today." });
  assert.deepEqual(readFinalText("One\nTwo\n**END**\n\n\n"), { kind: "reply", text: "One\nTwo" });
  assert.deepEqual(readFinalText("Windows\r\nlines\r\nEND\r\n"), { kind: "reply", text: "Windows\nlines" });
  assert.deepEqual(readFinalText("Indented.   \n  END  "), { kind: "reply", text: "Indented." });
});

test("an END line before the last line is left where it is", () => {
  assert.deepEqual(readFinalText("END\nbut then more"), { kind: "reply", text: "END\nbut then more" });
  assert.deepEqual(readFinalText("one\nEND\ntwo"), { kind: "reply", text: "one\nEND\ntwo" });
});

test("only the last END line goes", () => {
  assert.deepEqual(readFinalText("Hello\nEND\nEND"), { kind: "reply", text: "Hello\nEND" });
  assert.deepEqual(readFinalText("\n\nEND\nEND"), { kind: "reply", text: "\n\nEND" });
});

test("a reply is posted as it was written, trailing line breaks and all", () => {
  assert.deepEqual(readFinalText("Hello there.\n"), { kind: "reply", text: "Hello there.\n" });
});

test("text that fits is one part", () => {
  assert.deepEqual(inParts("hello", 10), ["hello"]);
  assert.deepEqual(inParts("0123456789", 10), ["0123456789"]);
});

test("longer text is split into parts that each fit, and together hold all of it", () => {
  const text = "x".repeat(25);
  const parts = inParts(text, 10);
  assert.deepEqual(
    parts.map((part) => part.length),
    [10, 10, 5],
  );
  assert.equal(parts.join(""), text);
});

test("a part ends at a line break when one falls in the later half of what fits", () => {
  const text = "first line here\nsecond line is longer than the rest\nthird";
  const parts = inParts(text, 25);

  assert.equal(parts[0], "first line here\n");
  assert.equal(parts.join(""), text);
  for (const part of parts) assert.ok(part.length <= 25, part);
});

test("a line break early in what fits is not worth a short part", () => {
  const parts = inParts("ab\ncdefghijklmnopqrstuvwxyz", 20);

  assert.deepEqual(
    parts.map((part) => part.length),
    [20, 7],
  );
});

test("a character that takes two code units is never split", () => {
  const text = "ab😀cd😀ef";
  for (const limit of [2, 3, 4, 5]) {
    const parts = inParts(text, limit);
    assert.equal(parts.join(""), text);
    for (const part of parts) assert.doesNotMatch(part, /[\ud800-\udbff]$|^[\udc00-\udfff]/, JSON.stringify(part));
  }
});

test("a part with nothing in it is dropped, because chat does not take one", () => {
  assert.deepEqual(inParts(`${"a".repeat(10)}${" ".repeat(10)}`, 10), ["a".repeat(10)]);
  assert.deepEqual(inParts(`${"a".repeat(10)}${"\n".repeat(10)}b`, 10), ["a".repeat(10), "b"]);
});

test("a limit of one still makes progress", () => {
  assert.deepEqual(inParts("abc", 1), ["a", "b", "c"]);
});

test("a reason that is too long is cut with an ellipsis, and not through a character", () => {
  assert.equal(clip("short", 10), "short");
  assert.equal(clip("0123456789", 10), "0123456789");
  assert.equal(clip("0123456789A", 10), "012345678…");
  assert.equal(clip("0123456😀89", 9), "0123456…");
  assert.equal(clip("ab😀cd", 4), "ab…");
});

test("a reply is named for the thread's session, the answer and the part", () => {
  assert.equal(replyRequestId("th_000000000001", "345", 0), "reply-th_000000000001-345-0");
  assert.notEqual(replyRequestId("th_1", "7", 0), replyRequestId("th_1", "7", 1));
  assert.notEqual(replyRequestId("th_1", "7", 0), replyRequestId("th_2", "7", 0));
});
