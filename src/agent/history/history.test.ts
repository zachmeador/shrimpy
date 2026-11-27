import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall, type Message, type ToolResultMessage } from "@earendil-works/pi-ai";
import { callingTools, roomWith, startAgentRig } from "../testing/index.ts";
import { COMPACTION_REMINDER } from "./durable.ts";

const timeout = 60_000;

test("history searches and reads pre-compaction session entries and injects the compaction reminder", { timeout }, async (t) => {
  const seenRequests: (readonly Message[])[] = [];
  const toolResults: { name: string; isError: boolean; text: string }[] = [];
  let searchHitRef: string | undefined;

  const script = (messages: readonly Message[]) => {
    // Pi's built-in CompactionTask calls the model with a system prompt asking for a summary.
    const system = messages[0]?.role === "system" ? textOf(messages[0].content) : "";
    if (system.includes("context summarization assistant")) {
      return fauxAssistantMessage("## Goal\nCompacted earlier work (specific details omitted).");
    }

    seenRequests.push(messages);
    const userCount = messages.filter((m) => m.role === "user").length;
    const recentResults = resultsAfterLastUser(messages);
    for (const result of recentResults.slice(toolResults.length === 0 ? 0 : recentResults.length - 1)) {
      if (recentResults.length > 0 && result === recentResults.at(-1)) {
        toolResults.push({ name: result.toolName, isError: result.isError, text: textOf(result.content) });
      }
    }

    const lastUser = messages.findLast((m) => m.role === "user");
    const lastText = lastUser === undefined ? "" : textOf(lastUser.content);

    // Turn 1: run bash printing a unique pre-compaction needle.
    if (lastText.includes("RUN_NEEDLE")) {
      if (recentResults.length === 0) {
        return fauxAssistantMessage([fauxToolCall("bash", { command: "printf 'SECRET_NEEDLE_7741\\n'" }, { id: "call-bash" })], {
          stopReason: "toolUse",
        });
      }
      return fauxAssistantMessage("Ran the check.");
    }

    // Turn 2: filler turn that grows the context past the small test contextWindow on the next turn.
    if (lastText.includes("FILLER_ONE")) {
      return fauxAssistantMessage(`Acknowledged filler one. ${"alpha ".repeat(4_500)}`);
    }

    // Turn 3 (after compaction): search for the needle, expand around the hit, and read right before compaction.
    if (lastText.includes("RECALL_NOW")) {
      if (recentResults.length === 0) {
        return fauxAssistantMessage(
          [fauxToolCall("history", { action: "search", query: "SECRET_NEEDLE_7741" }, { id: "call-search" })],
          { stopReason: "toolUse" },
        );
      }
      if (recentResults.length === 1) {
        const searchOut = textOf(recentResults[0]!.content);
        const match = /\[(e\d+)\]/.exec(searchOut);
        searchHitRef = match?.[1];
        assert.ok(searchHitRef, `expected pre-compaction entry ref in:\n${searchOut}`);
        return fauxAssistantMessage(
          [fauxToolCall("history", { action: "read", ref: searchHitRef, limit: 6 }, { id: "call-read-ref" })],
          { stopReason: "toolUse" },
        );
      }
      if (recentResults.length === 2) {
        return fauxAssistantMessage([fauxToolCall("history", { action: "read", limit: 6 }, { id: "call-read-compact" })], {
          stopReason: "toolUse",
        });
      }
      return fauxAssistantMessage(`Recovered via ${searchHitRef}.`);
    }

    return fauxAssistantMessage(`Fallback (${userCount}).`);
  };

  // Small context window forces Pi's default compaction policy (reserve=16384, keepRecent=20000) to compact on Turn 3.
  const rig = await startAgentRig(t, {
    script,
    contextWindow: 40_000,
    tokensPerSecond: 1_000_000,
    tokenSize: { min: 5_000, max: 10_000 },
  });

  await rig.receiptOn(await rig.say("RUN_NEEDLE"));
  await rig.receiptOn(await rig.say(`FILLER_ONE ${"beta ".repeat(10_000)}`));
  await rig.receiptOn(await rig.say(`RECALL_NOW ${"gamma ".repeat(6_000)}`));

  // Verify compaction actually happened and the post-compaction request carried the reminder (without the raw needle).
  const recallRequest = seenRequests.find((msgs) => {
    const last = msgs.findLast((m) => m.role === "user");
    return last !== undefined && textOf(last.content).includes("RECALL_NOW");
  });
  assert.ok(recallRequest, "expected Turn 3 request");
  const compactionUser = recallRequest.find(
    (m) => m.role === "user" && textOf(m.content).includes("The conversation history before this point was compacted"),
  );
  assert.ok(compactionUser, "expected Pi compaction summary in Turn 3 request");
  assert.ok(textOf(compactionUser.content).includes(COMPACTION_REMINDER.trim()), "expected history reminder appended to compaction summary");
  assert.equal(
    recallRequest.some((m) => textOf(m.content).includes("SECRET_NEEDLE_7741")),
    false,
    "pre-compaction bash needle should no longer be in live model context",
  );

  // Verify the three history tool calls succeeded and surfaced the pre-compaction bash output.
  const searchResult = toolResults.find((r) => r.name === "history" && r.text.includes("Matches for"));
  assert.ok(searchResult && !searchResult.isError, JSON.stringify(toolResults));
  assert.ok(searchResult.text.includes("[pre-compaction]"), searchResult.text);
  assert.ok(searchResult.text.includes("SECRET_NEEDLE_7741"), searchResult.text);

  const aroundResult = toolResults.find((r) => r.name === "history" && r.text.includes("<-- match"));
  assert.ok(aroundResult && !aroundResult.isError, JSON.stringify(toolResults));
  assert.ok(aroundResult.text.includes("SECRET_NEEDLE_7741"), aroundResult.text);

  const beforeCompactResult = toolResults.find((r) => r.name === "history" && r.text.includes("before compaction"));
  assert.ok(beforeCompactResult && !beforeCompactResult.isError, JSON.stringify(toolResults));
  assert.ok(beforeCompactResult.text.includes("SECRET_NEEDLE_7741"), beforeCompactResult.text);
});

test("history searches across threads and rooms, reads around sparse chat seqs, and respects admin vs non-admin visibility", { timeout }, async (t) => {
  // Scout is the first agent on the roster (admin).
  let roomMsgRef: string | undefined;
  const scoutScript = (messages: readonly Message[]) => {
    const recent = resultsAfterLastUser(messages);
    const last = messages.findLast((m) => m.role === "user");
    const lastText = last === undefined ? "" : textOf(last.content);

    if (lastText.includes("SEED_OTHER_THREAD")) {
      return fauxAssistantMessage("Noted: backup server is cashmoney-99.");
    }
    if (lastText.includes("SEARCH_EVERYTHING")) {
      if (recent.length === 0) {
        return fauxAssistantMessage(
          [
            fauxToolCall("history", { action: "search", query: "cashmoney-99", all: true }, { id: "c-all" }),
            fauxToolCall("history", { action: "search", query: "secret-quartz", in: "#secret" }, { id: "c-secret" }),
            fauxToolCall("thread", { action: "list", to: "#secret" }, { id: "c-list-secret" }),
          ],
          { stopReason: "toolUse" },
        );
      }
      if (recent.length === 3) {
        const secretOut = textOf(recent[1]!.content);
        const match = /\[(th_[0-9a-z]{12}#m\d+)\]/.exec(secretOut);
        roomMsgRef = match?.[1];
        assert.ok(roomMsgRef, `expected chat message ref in:\n${secretOut}`);
        return fauxAssistantMessage(
          [fauxToolCall("history", { action: "read", ref: roomMsgRef, limit: 3 }, { id: "c-read-msg" })],
          { stopReason: "toolUse" },
        );
      }
      const readOut = textOf(recent[3]!.content);
      return fauxAssistantMessage(`FOUND:${textOf(recent[0]!.content).includes("cashmoney-99")}:${readOut.includes("before-quartz") && readOut.includes("after-quartz")}:${textOf(recent[2]!.content).includes("Threads in the room #secret")}`);
    }
    return fauxAssistantMessage("ok");
  };

  const scout = await startAgentRig(t, { name: "scout", script: scoutScript, tokensPerSecond: 1_000_000 });

  // Second agent (maya) and third agent (rex) are non-admins.
  const maya = await scout.chat.agent("maya");
  const rexModel = callingTools(
    [
      [
        { name: "history", args: { action: "search", query: "secret-quartz", all: true } },
        { name: "history", args: { action: "search", query: "secret-quartz", in: "#secret" } },
      ],
    ],
    "Checked.",
  );
  const rex = await startAgentRig(t, {
    name: "rex",
    chat: scout.chat,
    script: rexModel.script,
    tokensPerSecond: 1_000_000,
  });

  // Create #secret with only you and maya (neither scout nor rex is in it), with interleaved messages so seq is sparse.
  const secret = await roomWith(t, scout.chat, "secret", [maya.you]);
  await scout.say("before-quartz", secret.pinned.id);
  const otherThread = await scout.newThread("Other");
  await scout.receiptOn(await scout.say("SEED_OTHER_THREAD", otherThread.id));
  await scout.say("middle secret-quartz target", secret.pinned.id);
  await scout.say("noise in other thread", otherThread.id);
  await scout.say("after-quartz", secret.pinned.id);

  // Admin scout searches its other thread (`all: true`), searches `#secret` it isn't in, lists `#secret`, and reads around the hit.
  const mainThread = await scout.newThread("Main");
  await scout.receiptOn(await scout.say("SEARCH_EVERYTHING", mainThread.id));
  const replies = await scout.replies(mainThread.id);
  assert.equal(replies.at(-1)?.text, "FOUND:true:true:true");

  // Non-admin rex sees nothing from #secret via `all: true` and is refused on `in: "#secret"`.
  await rex.receiptOn(await rex.say("try reading secret"));
  const [allRes, secretRes] = rexModel.answers;
  assert.ok(allRes !== undefined && secretRes !== undefined, JSON.stringify(rexModel.answers));
  assert.equal(allRes.isError, false);
  assert.ok(allRes.text.includes("No matches"), allRes.text);
  assert.equal(secretRes.isError, true);
  assert.equal(secretRes.text.includes("secret-quartz"), false);
});

function resultsAfterLastUser(messages: readonly Message[]): ToolResultMessage[] {
  const results: ToolResultMessage[] = [];
  for (const message of messages.toReversed()) {
    if (message.role === "user") break;
    if (message.role === "toolResult") results.unshift(message);
  }
  return results;
}

function textOf(content: Message["content"] | ToolResultMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
}
