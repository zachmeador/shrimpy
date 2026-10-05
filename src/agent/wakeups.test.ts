import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall, type Message } from "@earendil-works/pi-ai";
import { eventually, waitForView } from "../lib/testing/index.ts";
import { callingTools, loggedRequests, releaseGate, type Script, startAgentRig, untilReleased } from "./testing/index.ts";

/*
 * An agent waking itself later with `check_back`: the real engine under it and
 * the real chat server, a scripted model, and delays of a second or two.
 */

const timeout = 30_000;

/** What a message of a person, or a wake-up, says; nothing for any other message. */
function textOf(message: Message | undefined): string {
  if (message?.role !== "user") return "";
  return typeof message.content === "string" ? message.content : message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

/** What the latest message of a person, or a wake-up, says. */
const latestUserText = (messages: readonly Message[]): string => textOf(messages.findLast((message) => message.role === "user"));

/** Whether the model has just been handed the results of its tool calls. */
const hasToolResult = (messages: readonly Message[]): boolean => messages.at(-1)?.role === "toolResult";

test("a wake-up wakes the session after its delay, and the final text of the turn it starts is posted in the thread", { timeout }, async (t) => {
  // Three wake-ups in one turn. The first is answered, the second ends its turn with END, and the turn of the third fails.
  const script: Script = (messages) => {
    const latest = latestUserText(messages);
    if (latest.includes("set three wake-ups")) {
      if (hasToolResult(messages)) return fauxAssistantMessage("All three are set.");
      return fauxAssistantMessage(
        [
          fauxToolCall("check_back", { in: "2s", note: "say hello" }, { id: "call-0" }),
          fauxToolCall("check_back", { in: "3s", note: "stay quiet" }, { id: "call-1" }),
          fauxToolCall("check_back", { in: "4s", note: "be refused" }, { id: "call-2" }),
        ],
        { stopReason: "toolUse" },
      );
    }
    if (latest.includes("be refused")) {
      return fauxAssistantMessage([], { stopReason: "error", errorMessage: "The model refused the request." });
    }
    return fauxAssistantMessage(latest.includes("stay quiet") ? "END" : `Awake. ${latest}`);
  };
  const rig = await startAgentRig(t, { script });

  const asked = await rig.say("set three wake-ups");
  assert.equal((await rig.receiptOn(asked)).status, "answered");
  await rig.untilIdle();
  assert.deepEqual(await rig.working(), [], "a wake-up that is only waiting is not work");

  const replies = await eventually(() => rig.replies(), (found) => found.length === 2, { what: "the first wake-up to answer" });
  assert.equal(replies[0]?.text, "All three are set.");
  assert.ok(replies[1]?.text.includes("say hello"), "the note reached the model");

  // Five requests in all: the two of the first turn, and one for each wake-up.
  await eventually(() => loggedRequests(rig.home).length, (asked) => asked === 5, { what: "the last wake-up to be answered" });
  await rig.untilIdle();
  assert.equal((await rig.replies()).length, 2, "END and a failed turn post nothing");
  assert.equal((await rig.said()).flatMap((message) => message.receipts).length, 1, "and a wake-up leaves no receipt");
  assert.equal(rig.reports.length, 1, "but the failed turn is reported");
  assert.ok((rig.reports[0] as Error).message.includes("The model refused the request."));
});

test("a stop cancels the wake-ups a session is waiting on, and the next input tells the model which, once", { timeout }, async (t) => {
  // The first message asks to be woken in an hour, and keeps what the tool said. Everything else is echoed.
  let answer = "";
  const script: Script = (messages) => {
    const latest = latestUserText(messages);
    if (latest.includes("set a wake-up")) {
      const result = messages.at(-1);
      if (result?.role !== "toolResult") {
        const call = fauxToolCall("check_back", { in: "1h", note: "look at the build again" }, { id: "call-0" });
        return fauxAssistantMessage([call], { stopReason: "toolUse" });
      }
      answer = result.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      return fauxAssistantMessage("It is set.");
    }
    return fauxAssistantMessage(`Shown:\n${latest}`);
  };
  const rig = await startAgentRig(t, { script });
  await rig.receiptOn(await rig.say("set a wake-up"));
  const due = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.exec(answer)?.[0];
  assert.ok(due !== undefined, `the tool says when: ${answer}`);
  const { session } = await rig.attach();

  await session.stop();

  const next = await rig.say("are you there?");
  await rig.receiptOn(next);
  const told = (await rig.replies())[1]?.text ?? "";
  assert.ok(told.includes("look at the build again"), `the note: ${told}`);
  assert.ok(told.includes(due), `and when it was for: ${told}`);
  assert.ok(told.includes("are you there?"), "with the message it came with");

  await rig.receiptOn(await rig.say("and now?"));
  assert.ok(!(await rig.replies())[2]?.text.includes("look at the build again"), "and only once");
});

test("a wake-up and chat messages that arrive while the session is busy are answered in the order they came in", { timeout }, async (t) => {
  // The turn that asks for the wake-up stays open until the test lets it go, so everything after it has to wait.
  const script: Script = async (messages, home) => {
    const latest = latestUserText(messages);
    if (latest.includes("set a wake-up")) {
      if (!hasToolResult(messages)) {
        const call = fauxToolCall("check_back", { in: "2s", note: "the wake-up" }, { id: "call-0" });
        return fauxAssistantMessage([call], { stopReason: "toolUse" });
      }
      await untilReleased(home);
      return fauxAssistantMessage("It is set.");
    }
    const answered = messages.findLastIndex((message) => message.role === "assistant");
    return fauxAssistantMessage(`Shown:\n${messages.slice(answered + 1).map(textOf).join("\n")}`);
  };
  const rig = await startAgentRig(t, { script });
  await rig.say("set a wake-up");
  await rig.untilWorking();
  const { session } = await rig.attach();

  // A chat message before the wake-up comes due, and one after it has.
  await rig.say("chat message A");
  await waitForView(session, (view) => view.status.queued.length === 1);
  await waitForView(session, (view) => view.status.queued.length === 2);
  const last = await rig.say("chat message B");
  await waitForView(session, (view) => view.status.queued.length === 3);
  releaseGate(rig.home);

  await rig.receiptOn(last);
  const shown = (await rig.replies()).at(-1)?.text ?? "";
  const at = (text: string): number => shown.indexOf(text);
  assert.ok(at("chat message A") !== -1 && at("chat message A") < at("the wake-up"), shown);
  assert.ok(at("the wake-up") < at("chat message B"), shown);
});

test("check_back refuses what it can't use, and each refusal sets nothing", { timeout }, async (t) => {
  const future = new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const refused: Record<string, string>[] = [
    { in: "5m", at: future, note: "both" },
    { note: "neither" },
    { in: "five minutes", note: "a delay that can't be read" },
    { at: "tomorrow morning", note: "a time that can't be read" },
    { at: future.replace("Z", ""), note: "a time with no offset" },
    { at: "2026-02-31T10:00:00Z", note: "a day the calendar doesn't have" },
    { at: "2020-01-01T00:00:00Z", note: "a time in the past" },
    { in: "0s", note: "a delay that is too short" },
    { in: "9999d", note: "a delay that is too long" },
    { in: "5m", note: "   " },
    { in: "5m", note: "x".repeat(5_000) },
  ];
  // Twenty are waiting at the most, so the twenty-first is refused too; had a refusal set one, an earlier call would fail.
  const set = Array.from({ length: 20 }, (_, number) => ({ in: "1h", note: `wake-up ${String(number)}` }));
  const calls = [...refused, ...set, { in: "1h", note: "one too many" }].map((args) => ({ name: "check_back", args }));
  const model = callingTools([calls]);
  const rig = await startAgentRig(t, { script: model.script, tokensPerSecond: 1_000_000 });

  await rig.receiptOn(await rig.say("ask for a lot of wake-ups"));

  const outcomes = model.answers.map((answer) => answer.isError);
  assert.deepEqual(outcomes, [...refused.map(() => true), ...set.map(() => false), true]);
  assert.ok(model.answers.at(-1)?.text.includes("20"), "the last says how many are waiting");
});
