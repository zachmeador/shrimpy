import assert from "node:assert/strict";
import { test } from "node:test";
import { refused } from "../testing/index.ts";
import { flag, identifier, identifiers, label, member, messageText, receipt, whole } from "./index.ts";
import { MAX_DETAIL, MAX_ID, MAX_NAME, MAX_TEXT } from "./limits.ts";

test("an ID is one word of bounded length", () => {
  assert.equal(identifier("person:zach", "id"), "person:zach");
  assert.equal(identifier("x".repeat(MAX_ID), "id").length, MAX_ID);

  for (const bad of ["", " ", "two words", "tab\there", "line\nbreak", "x".repeat(MAX_ID + 1), 5, null, {}]) {
    assert.throws(() => identifier(bad, "id"), refused(/^id must be an ID/));
  }
});

test("a name is trimmed, on one line, and bounded", () => {
  assert.equal(label("  Zach  ", "name"), "Zach");
  assert.equal(label("Two words", "name"), "Two words");
  assert.equal(label("n".repeat(MAX_NAME), "name").length, MAX_NAME);

  for (const bad of ["", "   ", "two\nlines", "n".repeat(MAX_NAME + 1), 7, undefined]) {
    assert.throws(() => label(bad, "name"), refused(/^name must be 1 to 200 characters/));
  }
});

test("message text is kept exactly as sent, and must say something within the limit", () => {
  assert.equal(messageText("  spaced\nout  "), "  spaced\nout  ");
  assert.equal(messageText("m".repeat(MAX_TEXT)).length, MAX_TEXT);

  for (const bad of ["", " \n\t", 3, null]) {
    assert.throws(() => messageText(bad), refused(/needs some text/));
  }
  assert.throws(() => messageText("m".repeat(MAX_TEXT + 1)), refused(new RegExp(`at most ${String(MAX_TEXT)} characters`)));
});

test("a whole number has a least value", () => {
  assert.equal(whole(0, "cursor", 0), 0);
  assert.equal(whole(42, "limit", 1), 42);

  for (const bad of [0.5, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60, "3", null]) {
    assert.throws(() => whole(bad, "limit", 1), refused(/^limit must be a whole number, 1 or more/));
  }
});

test("a flag is true or false", () => {
  assert.equal(flag(true, "archived"), true);
  assert.equal(flag(false, "archived"), false);
  assert.throws(() => flag("true", "archived"), refused(/^archived must be true or false/));
  assert.throws(() => flag(1, "archived"), refused(/^archived must be true or false/));
});

test("a member is an ID, a kind and a name, and nothing else is kept", () => {
  assert.deepEqual(
    member({ id: "agent:shrimpy", kind: "agent", name: " Shrimpy ", token: "ignored" }, "member"),
    { id: "agent:shrimpy", kind: "agent", name: "Shrimpy" },
  );

  assert.throws(() => member("agent:shrimpy", "member"), refused(/^member must be a member/));
  assert.throws(() => member(null, "member"), refused(/^member must be a member/));
  assert.throws(
    () => member({ id: "a", kind: "robot", name: "A" }, "member"),
    refused(/^member.kind must be/),
  );
  assert.throws(
    () => member({ id: "has space", kind: "person", name: "A" }, "member"),
    refused(/^member.id must be an ID/),
  );
  assert.throws(
    () => member({ id: "a", kind: "person", name: "" }, "member"),
    refused(/^member.name must be 1 to/),
  );
});

test("a list of IDs has at least one and at most a limit", () => {
  assert.deepEqual(identifiers(["msg_1", "msg_2"], "messageIds", 3), ["msg_1", "msg_2"]);

  for (const bad of [[], ["a", "b", "c", "d"], "msg_1", null, ["has space"]]) {
    assert.throws(() => identifiers(bad, "messageIds", 3), refused(/^messageIds/));
  }
});

test("a receipt is a status with the reply or reason that goes with it, and nothing else is kept", () => {
  assert.deepEqual(receipt({ status: "silent", reply: null, detail: null }, "receipt"), {
    status: "silent",
    reply: null,
    detail: null,
  });
  assert.deepEqual(receipt({ status: "answered", reply: "msg_1", detail: null, memberId: "agent:x" }, "receipt"), {
    status: "answered",
    reply: "msg_1",
    detail: null,
  });
  assert.deepEqual(receipt({ status: "failed", reply: null, detail: "The model timed out." }, "receipt"), {
    status: "failed",
    reply: null,
    detail: "The model timed out.",
  });
  for (const status of ["stopped", "skipped"]) {
    assert.equal(receipt({ status, reply: null, detail: null }, "receipt").status, status);
  }
});

test("a reply or detail that is left out counts as null, and a failure may have no reason", () => {
  assert.deepEqual(receipt({ status: "failed" }, "receipt"), { status: "failed", reply: null, detail: null });
  assert.deepEqual(receipt({ status: "silent", reply: undefined }, "receipt"), {
    status: "silent",
    reply: null,
    detail: null,
  });
});

test("a receipt has a status the chat server knows, and a reply only when answered", () => {
  for (const bad of ["tidy", "", 3, undefined, null, "__proto__", "toString"]) {
    assert.throws(
      () => receipt({ status: bad, reply: null, detail: null }, "receipt"),
      refused(/^receipt.status must be "answered", "silent", "stopped", "skipped" or "failed"/),
    );
  }
  for (const bad of ["status: silent", null, 7, undefined]) {
    assert.throws(() => receipt(bad, "receipt"), refused(/^receipt must be a receipt/));
  }
  for (const missing of [null, undefined]) {
    assert.throws(
      () => receipt({ status: "answered", reply: missing, detail: null }, "receipt"),
      refused(/^An answered receipt needs a reply/),
    );
  }
  for (const status of ["silent", "stopped", "skipped", "failed"]) {
    assert.throws(
      () => receipt({ status, reply: "msg_1", detail: null }, "receipt"),
      refused(new RegExp(`^Only an answered receipt has a reply, and this one is ${status}`)),
    );
  }
  assert.throws(
    () => receipt({ status: "answered", reply: "two words", detail: null }, "receipt"),
    refused(/^receipt.reply must be an ID/),
  );
});

test("a detail belongs to a failure, and is some text within the limit", () => {
  for (const status of ["answered", "silent", "stopped", "skipped"]) {
    assert.throws(
      () => receipt({ status, reply: status === "answered" ? "msg_1" : null, detail: "why" }, "receipt"),
      refused(new RegExp(`^Only a failed receipt has a detail, and this one is ${status}`)),
    );
  }
  const longest = "d".repeat(MAX_DETAIL);
  assert.equal(receipt({ status: "failed", reply: null, detail: longest }, "receipt").detail, longest);
  assert.equal(
    receipt({ status: "failed", reply: null, detail: "  two\nlines  " }, "receipt").detail,
    "  two\nlines  ",
  );

  for (const bad of ["", "  \n", 5, {}]) {
    assert.throws(
      () => receipt({ status: "failed", reply: null, detail: bad }, "receipt"),
      refused(/^receipt.detail must be some text, or null/),
    );
  }
  assert.throws(
    () => receipt({ status: "failed", reply: null, detail: "d".repeat(MAX_DETAIL + 1) }, "receipt"),
    refused(new RegExp(`^receipt.detail holds at most ${String(MAX_DETAIL)} characters, and this one has ${String(MAX_DETAIL + 1)}`)),
  );
});
