import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  channelDeliveryGuidance,
  compactionChunk,
  compactionUpdate,
  fallbackIdentity,
  productInstructionCatalog,
  toolParameterInstructions,
  turnContextLeading,
} from "../dist/instructions/index.js";

describe("product instruction catalog", () => {
  test("retains a unique stable identifier for every catalogued instruction", () => {
    const ids = productInstructionCatalog.map((instruction) => instruction.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes("identity.fallback"));
    assert.ok(ids.includes("session.delivery.channel"));
    assert.ok(ids.includes("turn.context.leading"));
    assert.ok(ids.includes("compaction.summary"));
    assert.ok(ids.includes("worker.coding.contract"));
    assert.ok(ids.includes("tool.reply.description"));
    assert.equal(productInstructionCatalog.every((instruction) => instruction.source === "shrimpy"), true);
  });

  test("renders runtime values without changing product wording", () => {
    assert.equal(fallbackIdentity.render(), "You are shrimpy.");
    assert.deepEqual(channelDeliveryGuidance.render({ channel: "home" }).split("\n"), [
      "Plain assistant text is private and never reaches the channel.",
      "Use reply(text) for a normal user-visible response; use ask(text), notify(text), or report(summary) when those intents fit.",
      "Use send_message(channel=\"home\", text=\"...\") only for explicit routing to another destination. A user:<id> alias targets that user's last active chat surface; agent DM channels are internal and have no external adapter by default.",
      "After publishing, do not duplicate the message in plain assistant text; wait for another incoming message.",
    ]);
    assert.equal(toolParameterInstructions.readChannelLimit.render(), "Max messages to return (default 20)");
    assert.equal(turnContextLeading.render(), "The turn context above is background for the user message below. Answer the user message below using this context when relevant.");
  });

  test("renders compaction chunk framing with its dynamic boundaries", () => {
    assert.match(
      compactionChunk.render({
        chunkText: "history",
        chunkIndex: 2,
        totalChunks: 3,
        customInstructions: "Preserve dates.",
      }),
      /^<conversation chunk="2" chunks="3">\nhistory\n<\/conversation>/,
    );
    assert.match(
      compactionUpdate.render({ source: "chunk-summaries" }),
      /^The chunk summaries above describe NEW conversation messages/,
    );
  });
});
