import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { Message, Receipt } from "../contracts/chat/index.ts";
import { until, waitForView } from "../lib/testing/index.ts";
import {
  type AgentRig,
  releaseGate,
  roomWith,
  SCOUT,
  type Script,
  shownSinceLastAnswer,
  startAgentRig,
  untilReleased,
} from "./testing/index.ts";

/*
 * An agent whose turn is running when a message comes in: which messages the
 * turn reads before it ends, which wait for the next one, and when the turn's
 * reply is posted. The real engine is under it, with the real chat server, and
 * the model is scripted.
 */

const timeout = 30_000;

/**
 * A model whose turn has two steps: the first runs a shell command, once the
 * test lets it go, and the second answers. `asked` is what each request showed
 * it that it had not been shown before, oldest first.
 */
function twoSteps(): { script: Script; asked: string[] } {
  const asked: string[] = [];
  const script: Script = async (messages, home) => {
    asked.push(shownSinceLastAnswer(messages));
    const last = messages.findLast((message) => message.role === "assistant");
    if (last?.role === "assistant" && last.stopReason === "toolUse") return fauxAssistantMessage("Done.");
    await untilReleased(home);
    const call = fauxToolCall("bash", { command: "true" }, { id: `call-${String(asked.length)}` });
    return fauxAssistantMessage([call], { stopReason: "toolUse" });
  };
  return { script, asked };
}

/**
 * A model that answers a request only when the test lets it, the requests in
 * the order they came. `asked` is how many have come. `release` lets every
 * request through from then on, so that a test that fails leaves no turn held.
 */
function heldAnswers(): { script: Script; asked(): number; answer(): void; release(): void } {
  const held: (() => void)[] = [];
  let answered = 0;
  let released = false;
  const script: Script = async () => {
    if (!released) await new Promise<void>((resolve) => held.push(resolve));
    return fauxAssistantMessage("Done.");
  };
  return {
    script,
    asked: () => held.length,
    answer: () => {
      held[answered]?.();
      answered += 1;
    },
    release: () => {
      released = true;
      for (const answer of held) answer();
    },
  };
}

/** Where the person talks to the agent, which is the thread of a DM or of a room, and how they mention it there: by name, or to everyone. */
const PLACES: { name: string; mention: string; open(rig: AgentRig): Promise<string> }[] = [
  { name: "a DM", mention: `@${SCOUT}`, open: (rig) => Promise.resolve(rig.thread.id) },
  { name: "a room", mention: "@all", open: async (rig) => (await roomWith(rig.chat, "Ops", [rig.partner])).main.id },
];

/**
 * Start a turn in a thread with a first message, and hold it before its first
 * step is over. Say what `say` says meanwhile, then let the turn go and wait
 * for every message to get its receipt.
 */
async function sayWhileTurnRuns(
  rig: AgentRig,
  asked: string[],
  threadId: string,
  say: () => Promise<Message[]>,
): Promise<{ first: Message; later: Message[]; receipts: Receipt[]; replies: Message[] }> {
  const first = await rig.say("first", threadId);
  await until(() => asked.length === 1, "the model to be asked for the first step of the turn");
  const { session } = await rig.attach(threadId);
  const later = await say();
  await waitForView(session, (view) => view.status.queued.length === later.length);
  releaseGate(rig.home);
  const receipts = await Promise.all([first, ...later].map((message) => rig.receiptOn(message)));
  return { first, later, receipts, replies: await rig.replies(threadId) };
}

/** What happened when the message said meanwhile waited for the next turn: its own turn, its own reply and its own receipt. */
function assertWaitedForNextTurn(
  rig: AgentRig,
  asked: string[],
  { first, later, receipts, replies }: Awaited<ReturnType<typeof sayWhileTurnRuns>>,
): void {
  const [second] = later;
  assert.ok(second);
  assert.ok(!asked[1]?.includes(second.text), "the first turn's second step did not read it");
  assert.ok(asked.slice(2).some((shown) => shown.includes(second.text)), "the next turn did");
  assert.equal(replies.length, 2, "and answered it with a reply of its own");
  assert.deepEqual(
    receipts,
    [first, second].map((message, index) => ({
      memberId: rig.partner.id,
      event: message.event,
      status: "answered",
      reply: replies[index]?.id,
      detail: null,
    })),
  );
  assert.deepEqual(rig.reports, []);
}

test("a person's messages that mention the agent, sent in one step of a turn that runs, are all read by that turn at its next step, and the turn's one reply answers them", { timeout }, async (t) => {
  for (const place of PLACES) {
    await t.test(place.name, async (inner) => {
      const { script, asked } = twoSteps();
      const rig = await startAgentRig(inner, { script });
      const threadId = await place.open(rig);

      const { first, later, receipts, replies } = await sayWhileTurnRuns(rig, asked, threadId, async () => [
        await rig.say(`${place.mention}, one more thing`, threadId),
        await rig.say(`${place.mention}, and another`, threadId),
      ]);

      assert.equal(asked.length, 2, "one turn, of two steps");
      for (const message of later) assert.ok(asked[1]?.includes(message.text), `its second step read ${message.text}`);
      const [reply, ...others] = replies;
      assert.deepEqual(others, [], "and it answered all of them with one reply");
      assert.deepEqual(
        receipts,
        [first, ...later].map((message) => ({ memberId: rig.partner.id, event: message.event, status: "answered", reply: reply?.id, detail: null })),
        "each message has a receipt of its own",
      );
      assert.deepEqual(rig.reports, []);
    });
  }
});

test("a person's message that does not mention the agent, sent while a turn runs, waits for the next turn", { timeout }, async (t) => {
  for (const place of PLACES) {
    await t.test(place.name, async (inner) => {
      const { script, asked } = twoSteps();
      const rig = await startAgentRig(inner, { script });
      const threadId = await place.open(rig);

      const waited = await sayWhileTurnRuns(rig, asked, threadId, async () => [await rig.say("and one more thing", threadId)]);

      assertWaitedForNextTurn(rig, asked, waited);
    });
  }
});

test("an agent's message that mentions the agent, sent while a turn runs, waits for the next turn", { timeout }, async (t) => {
  const { script, asked } = twoSteps();
  const rig = await startAgentRig(t, { script });
  const bob = await rig.chat.agent("bob");
  const { main } = await roomWith(rig.chat, "Ops", [rig.partner, bob.me]);

  const waited = await sayWhileTurnRuns(rig, asked, main.id, async () => [await bob.chat.post(main.id, `@${SCOUT}, one more thing`, "bob-1")]);

  assertWaitedForNextTurn(rig, asked, waited);
});

test("a turn's reply is posted when the turn ends, while the next turn of its session still runs", { timeout }, async (t) => {
  const model = heldAnswers();
  const rig = await startAgentRig(t, { script: model.script });
  try {
    const first = await rig.say("first");
    await until(() => model.asked() === 1, "the model to be asked for the first turn");
    const { session } = await rig.attach();
    const second = await rig.say("and one more thing");
    await waitForView(session, (view) => view.status.queued.length === 1);
    model.answer();
    await until(() => model.asked() === 2, "the model to be asked for the next turn");

    const receipt = await rig.receiptOn(first);
    const [reply, ...others] = await rig.replies();
    assert.deepEqual(others, [], "the next turn has not answered yet");
    assert.deepEqual(receipt, { memberId: rig.partner.id, event: first.event, status: "answered", reply: reply?.id, detail: null });

    model.answer();
    assert.equal((await rig.receiptOn(second)).status, "answered");
    assert.deepEqual(rig.reports, []);
  } finally {
    model.release();
  }
});
