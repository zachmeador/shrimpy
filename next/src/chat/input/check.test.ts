import assert from "node:assert/strict";
import { test } from "node:test";
import { RemoteServiceError } from "@earendil-works/chord";
import {
  flag,
  identifier,
  identifiers,
  label,
  MAX_ID,
  MAX_NAME,
  MAX_TEXT,
  member,
  messageText,
  Refusal,
  whole,
} from "./index.ts";

const refused = (message: RegExp) => ({
  name: "Refusal",
  code: "service_invalid_value",
  message,
});

test("a refusal is a service error that carries its reason", () => {
  const refusal = new Refusal("Not that.");

  assert.ok(refusal instanceof RemoteServiceError);
  assert.equal(refusal.message, "Not that.");
  assert.equal(refusal.code, "service_invalid_value");
  assert.equal(new Refusal("Who are you?", "service_not_allowed").code, "service_not_allowed");
});

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
  assert.throws(() => messageText("m".repeat(MAX_TEXT + 1)), refused(/at most 20000 characters/));
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
