import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, personMember } from "../../contracts/chat/index.ts";
import { startStandInChat } from "../../contracts/chat/testing/index.ts";
import { useRuntimeDir } from "../../lib/testing/index.ts";
import { isRefusal } from "./index.ts";

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
