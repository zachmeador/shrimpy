import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { backoff } from "../lib/retry/index.ts";
import { countedBackoff, stopAfter, until } from "../lib/testing/index.ts";
import { ChatRunningError, startChat } from "./index.ts";
import { startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("a second chat server is refused, and holds wait while chat is away and bind again once it is back", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const dm = valueOf(await (await you.host.get(Chat, {}, context)).openDm({ member: scout.you.id }, context));
  const [main] = (await you.host.get(Channel, { channel: dm.id }, context)).threads.value;
  assert.ok(main);
  const thread = you.host.hold(Thread, { thread: main.id }, context);
  await until(() => thread.state.value.kind === "live", "your hold of the thread to bind");
  valueOf(await thread.post({ text: "Before the restart.", request: "you-1" }, context));

  await assert.rejects(startChat({ dataDir: chat.dataDir }), ChatRunningError);
  assert.equal(thread.state.value.kind, "live");

  await chat.chat.close();
  await until(() => thread.state.value.kind !== "live", "your hold to wait while chat is away");
  const again = await startChat({ dataDir: chat.dataDir, backoff: backoff({ firstMs: 5, maxMs: 50 }) });
  stopAfter(t, () => again.close());

  await until(() => thread.state.value.kind === "live", "your hold to bind again once chat is back");
  await until(() => thread.messages.value.length === 1, "the thread to show what was said");
  assert.equal(thread.messages.value[0]?.text, "Before the restart.");
  valueOf(await thread.post({ text: "After it.", request: "you-2" }, context));
});

test("while the gateway is away the chat server says so once, and once again when it is back", { timeout }, async (t) => {
  const said = t.mock.method(console, "error", () => undefined);
  const pauses = countedBackoff();
  const chat = await startChatInProcess(t, { pauses });
  const you = await chat.person();
  const held = you.host.hold(Chat, {}, context);
  await until(() => held.state.value.kind === "live", "chat to be reached through the gateway");
  const ofGateway = (): string[] => said.mock.calls.map((call) => call.arguments.join(" ")).filter((line) => line.includes("gateway"));
  assert.deepEqual(ofGateway(), []);

  await chat.gateway.outage();

  await until(() => ofGateway().length === 1, "the chat server to say it can't reach the gateway");
  const tried = pauses.taken();
  await until(() => pauses.taken() >= tried + 5, "the chat server to try five times more");
  assert.equal(ofGateway().length, 1, "said once, however often it tries");
  await chat.gateway.recover();
  await until(() => ofGateway().length === 2, "the chat server to say the gateway is back");
  const again = await chat.person();
  const back = await again.host.get(Chat, {}, context);
  assert.ok(back.you.value !== null, "and chat is reached through it again");
  assert.equal(ofGateway().length, 2, "and that was all it said of it");
});
