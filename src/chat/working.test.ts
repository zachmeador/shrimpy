import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { until } from "../lib/testing/index.ts";
import { startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("a working mark shows in the thread until it is cleared, or until the hold on Chat that made it ends with its link", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const dm = valueOf(await (await you.host.get(Chat, {}, context)).openDm({ member: scout.you.id }, context));
  const channel = await you.host.get(Channel, { channel: dm.id }, context);
  const [main] = channel.threads.value;
  assert.ok(main);
  const watching = await you.host.get(Thread, { thread: main.id }, context);
  const working = (): string[] => watching.thread.value?.working.map((mark) => mark.memberId) ?? [];
  const scouts = await scout.host.get(Chat, {}, context);

  valueOf(await scouts.setWorking({ thread: main.id, working: true }, context));
  await until(() => working().length === 1, "scout's mark to show");
  assert.deepEqual(working(), [scout.you.id]);
  await until(() => channel.threads.value[0]?.working.length === 1, "the mark to show in the channel's threads too");
  valueOf(await scouts.setWorking({ thread: main.id, working: false }, context));
  await until(() => working().length === 0, "scout's mark to clear when it says so");

  // A command in scout's shell holds Chat as scout too: one object, two holds. The shell's link dropping leaves the program's mark alone.
  valueOf(await scouts.setWorking({ thread: main.id, working: true }, context));
  await until(() => working().length === 1, "scout's mark to show again");
  const shell = await chat.gateway.connect(scout.token);
  assert.equal((await shell.host.get(Chat, {}, context)).you.value?.id, scout.you.id);
  await shell.close();
  // Anything the drop changed would reach you before the answer to this does.
  valueOf(await watching.read({ before: null, limit: 1 }, context));
  assert.deepEqual(working(), [scout.you.id]);

  // And the program's link dropping clears its mark, though another shell still holds Chat as scout.
  const another = await chat.gateway.connect(scout.token);
  const anothers = await another.host.get(Chat, {}, context);
  await scout.stop();
  await until(() => working().length === 0, "the mark to clear once scout's link drops");
  assert.equal(anothers.state.value.kind, "live", "the other hold goes on");
});
