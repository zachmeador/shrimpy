import assert from "node:assert/strict";
import { test } from "node:test";
import { RemoteServiceError } from "@earendil-works/chord";
import { DisconnectedError, ServerError } from "@earendil-works/pi-client";
import { agentMember, personMember } from "../../contracts/chat/index.ts";
import { startStandInChat } from "../../contracts/chat/testing/index.ts";
import { Refusal } from "../../lib/refusal/index.ts";
import { useRuntimeDir } from "../../lib/testing/index.ts";
import { isRefusal } from "./index.ts";

test("a refusal is an answer that said no for a reason asking again will not change", () => {
  assert.equal(isRefusal(new Refusal("Unknown thread: th_1")), true);
  assert.equal(isRefusal(new Refusal("Say who you are first", "service_not_allowed")), true);
});

test("across a connection a refusal arrives as the protocol's server error, and counts the same", () => {
  assert.equal(isRefusal(new ServerError({ code: "service_invalid_value", message: "Unknown thread: th_1" })), true);
  assert.equal(isRefusal(new ServerError({ code: "service_not_allowed", message: "Not now" })), true);
  assert.equal(isRefusal(new ServerError({ code: "server_draining", message: "Going away" })), false);
});

test("a call the chat server refuses over its socket is recognised as a refusal", { timeout: 15_000 }, async (t) => {
  useRuntimeDir(t);
  const stand = await startStandInChat(t);
  const agent = await stand.join(agentMember("scout"));
  stand.chat.dm(personMember("zach"), agentMember("scout"));

  await assert.rejects(agent.chat.feed(99, 10), (error: unknown) => {
    assert.equal(isRefusal(error), true);
    return true;
  });
});

test("a lost connection, a missing service and an ordinary error are not refusals", () => {
  assert.equal(isRefusal(new DisconnectedError()), false);
  assert.equal(isRefusal(new RemoteServiceError("service_not_found", "No such service")), false);
  assert.equal(isRefusal(new Error("nope")), false);
  assert.equal(isRefusal("service_invalid_value"), false);
});
