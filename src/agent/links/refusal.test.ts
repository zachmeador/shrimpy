import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember } from "../../contracts/chat/index.ts";
import { startChatServer } from "../testing/index.ts";
import { isRefusal } from "./index.ts";

test("a call the chat server refuses over its socket is recognised as a refusal", { timeout: 15_000 }, async (t) => {
  const chat = await startChatServer(t);
  const agent = await chat.join(agentMember("scout"));

  // A place in the feed past the newest message is refused, and asking again will not change that.
  await assert.rejects(agent.chat.feed(99, 10), (error: unknown) => {
    assert.equal(isRefusal(error), true);
    return true;
  });
});
