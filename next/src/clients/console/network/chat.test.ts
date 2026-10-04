import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { agentMember, personMember, type ThreadView } from "../../../contracts/chat/index.ts";
import { startStandInChat } from "../../../contracts/chat/testing/index.ts";
import { startStandInGateway } from "../../../contracts/gateway/testing/index.ts";
import { eventually, stopAfter, until, useRuntimeDir, within } from "../../../lib/testing/index.ts";
import { type ChatLink, keepChat, type ThreadUpdate } from "./chat.ts";
import type { RegistryLink } from "./registry.ts";
import { Down } from "./status.ts";
import { POLL_MS, quick, startRegistry } from "./testing/index.ts";
import { localTransports, type Transports } from "./transports.ts";

const timeout = 15_000;

const me = personMember("zach");
const scout = agentMember("scout");

interface Started {
  link: ChatLink;
  registry: RegistryLink;
  updates: ThreadUpdate[];
}

/** A gateway, and a link to the chat server it lists, which closes when the test ends. */
async function startLink(t: TestContext, transports: Transports = localTransports()): Promise<Started> {
  const registry = startRegistry(t, { transports });
  const updates: ThreadUpdate[] = [];
  const link = keepChat({ me, registry, transports, onThread: (update) => updates.push(update), backoff: quick() });
  stopAfter(t, () => link.close());
  return { link, registry, updates };
}

/** The views of `threadId` that were passed on, oldest first. */
const viewsOf = (updates: ThreadUpdate[], threadId: string): ThreadView[] =>
  updates.flatMap((update) => (update.threadId === threadId && "view" in update ? [update.view] : []));

async function startChat(t: TestContext) {
  useRuntimeDir(t);
  await startStandInGateway(t);
  return startStandInChat(t, { register: true });
}

test("it connects to the chat server the gateway lists, says who it is, and calls reach it", { timeout }, async (t) => {
  const stand = await startChat(t);
  const { link } = await startLink(t);

  await until(() => link.status().state === "up", "the chat server to be reached");
  const dm = await link.call((chat) => chat.openDm(scout));
  const [thread] = await link.call((chat) => chat.threads(dm.id));
  assert.ok(thread);
  await link.call((chat) => chat.post(thread.id, "hello", "request-1"));

  assert.deepEqual(
    stand.chat.messages().map((message) => [message.author.id, message.text]),
    [["person:zach", "hello"]],
  );
});

test("while no chat server is listed it says so, a call fails instead of waiting, and it connects when one is", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t);
  const { link } = await startLink(t);

  await until(() => JSON.stringify(link.status()) === JSON.stringify({ state: "down", why: { kind: "not-registered" } }), "the wait");
  await assert.rejects(
    link.call((chat) => chat.channels()),
    (error: unknown) => error instanceof Down && error.why.kind === "not-registered",
  );
  await startStandInChat(t, { register: true });

  await until(() => link.status().state === "up", "the chat server to be reached");
  assert.deepEqual(await link.call((chat) => chat.channels()), []);
});

test("it follows a thread, then each change to it, and following another thread lets go of the first", { timeout }, async (t) => {
  const stand = await startChat(t);
  const { link, updates } = await startLink(t);
  const { thread } = stand.chat.dm(me, scout);
  const other = await (async () => {
    const dm = stand.chat.dm(me, scout);
    return (await (await stand.chat.join(me)).chat.createThread(dm.channel.id, "side")).id;
  })();
  stand.chat.say(me, thread.id, "first");

  link.follow(thread.id);
  await eventually(() => viewsOf(updates, thread.id), (views) => views.length > 0, { what: "the first view" });
  stand.chat.say(scout, thread.id, "second");

  await eventually(() => viewsOf(updates, thread.id).at(-1), (view) => view?.messages.length === 2, { what: "the change" });
  assert.deepEqual(
    viewsOf(updates, thread.id).at(-1)?.messages.map((message) => message.text),
    ["first", "second"],
  );
  link.follow(other);
  await eventually(() => viewsOf(updates, other), (views) => views.length > 0, { what: "the other thread's view" });
  const seen = updates.length;
  stand.chat.say(me, thread.id, "third");
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3));

  assert.equal(updates.length, seen, "the thread that was let go of says nothing more");
});

test("following nothing lets go of the thread, and it can be followed again", { timeout }, async (t) => {
  const stand = await startChat(t);
  const { link, updates } = await startLink(t);
  const { thread } = stand.chat.dm(me, scout);

  link.follow(thread.id);
  await eventually(() => viewsOf(updates, thread.id), (views) => views.length > 0, { what: "the view" });
  link.follow(undefined);
  updates.length = 0;
  stand.chat.say(me, thread.id, "unheard");
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3));
  assert.deepEqual(updates, [], "nothing is passed on once the thread is let go of");
  link.follow(thread.id);

  await eventually(() => viewsOf(updates, thread.id).at(-1), (view) => view?.messages.length === 1, { what: "the view again" });
});

test("when the chat server is lost it says so, and when it is back the thread is followed again with what was said meanwhile", { timeout }, async (t) => {
  const stand = await startChat(t);
  const { link, updates } = await startLink(t);
  const { thread } = stand.chat.dm(me, scout);
  link.follow(thread.id);
  await eventually(() => viewsOf(updates, thread.id), (views) => views.length > 0, { what: "the view" });

  await stand.outage();

  await until(() => link.status().state === "down", "the loss to be noticed");
  await assert.rejects(
    link.call((chat) => chat.channels()),
    (error: unknown) => error instanceof Down,
  );
  stand.chat.say(scout, thread.id, "while you were away");
  await stand.recover();
  await until(() => link.status().state === "up", "the chat server to be reached again");

  await eventually(() => viewsOf(updates, thread.id).at(-1), (view) => view?.messages.at(-1)?.text === "while you were away", {
    what: "the view after the loss",
  });
});

test("a thread that cannot be followed is reported once, and not tried again until it is asked for again", { timeout }, async (t) => {
  const stand = await startChat(t);
  const { link, updates } = await startLink(t);
  await until(() => link.status().state === "up", "the chat server to be reached");

  link.follow("th_nothing");

  await eventually(() => updates, (list) => list.length === 1, { what: "the report" });
  const [report] = updates;
  assert.ok(report && "problem" in report);
  assert.deepEqual(report.problem, { said: "Unknown thread: th_nothing" });
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));
  assert.equal(updates.length, 1, "it was not tried again by itself");
  const { thread } = stand.chat.dm(me, scout);
  link.follow(thread.id);
  await eventually(() => viewsOf(updates, thread.id), (views) => views.length > 0, { what: "a thread that can" });
});

test("it reaches the chat server through the transports it is handed", { timeout }, async (t) => {
  await startChat(t);
  const local = localTransports();
  const reached: string[] = [];
  const { link } = await startLink(t, {
    ...local,
    program(registration) {
      reached.push(`${registration.kind} ${registration.name}`);
      return local.program(registration);
    },
  });

  await until(() => link.status().state === "up", "the chat server to be reached through them");

  assert.deepEqual(reached, ["chat chat"]);
});

test("closing leaves chat at once", { timeout }, async (t) => {
  const stand = await startChat(t);
  const { link } = await startLink(t);
  await until(() => link.status().state === "up", "the chat server to be reached");

  await within(2000, link.close(), "closing");

  await until(() => stand.connections() === 0, "the connection to end");
});
