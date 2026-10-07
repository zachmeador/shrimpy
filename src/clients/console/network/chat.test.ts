import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Member } from "../../../contracts/chat/index.ts";
import { joinRoster, startStandInChat } from "../../../contracts/chat/testing/index.ts";
import type { Transports } from "../../../contracts/gateway/index.ts";
import { localTransports } from "../../../contracts/gateway/node.ts";
import { startTestGateway } from "../../../contracts/gateway/testing/index.ts";
import { eventually, stopAfter, until, useRuntimeDir } from "../../../lib/testing/index.ts";
import { type ChatLink, keepChat, type ThreadUpdate } from "./chat.ts";
import { Down } from "./status.ts";
import { POLL_MS, quick, startRegistry } from "./testing/index.ts";

const timeout = 15_000;

/** A link to the chat server the gateway lists, which closes when the test ends. */
function startLink(t: TestContext, transports: Transports = localTransports()) {
  const registry = startRegistry(t, { transports });
  const updates: ThreadUpdate[] = [];
  const entered: Member[] = [];
  const link: ChatLink = keepChat({
    registry,
    transports,
    onEntered: (member) => entered.push(member),
    onThread: (update) => updates.push(update),
    backoff: quick(),
  });
  stopAfter(t, () => link.close());
  return { link, updates, entered };
}

test("while no chat server is listed it says so, a call fails instead of waiting, and it connects when one is", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startTestGateway(t);
  const { link } = startLink(t);

  await until(() => JSON.stringify(link.status()) === JSON.stringify({ state: "down", why: { kind: "not-registered" } }), "the wait");
  await assert.rejects(
    link.call((chat) => chat.channels()),
    (error: unknown) => error instanceof Down && error.why.kind === "not-registered",
  );
  await startStandInChat(t);

  await until(() => link.status().state === "up", "the chat server to be reached");
  assert.deepEqual(await link.call((chat) => chat.channels()), []);
});

test("a thread that cannot be followed is reported once, and not tried again until it is asked for again", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startTestGateway(t);
  const stand = await startStandInChat(t);
  const { link, updates, entered } = startLink(t);
  await until(() => link.status().state === "up", "the chat server to be reached");
  assert.deepEqual(entered.map((member) => member.kind), ["person"], "and the gateway said who the console is");

  link.follow("th_nothing");

  await eventually(() => updates, (list) => list.length === 1, { what: "the report" });
  const [report] = updates;
  assert.ok(report && "problem" in report);
  assert.deepEqual(report.problem, { said: "Unknown thread: th_nothing" });
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));
  assert.equal(updates.length, 1, "it was not tried again by itself");
  const { thread } = stand.chat.dm((await stand.asPerson()).me, await joinRoster(t, "scout"));
  link.follow(thread.id);
  await eventually(
    () => updates,
    (list) => list.some((update) => update.threadId === thread.id && "view" in update),
    { what: "a thread that can" },
  );
});

test("it reaches the chat server through the transports it is handed", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startTestGateway(t);
  await startStandInChat(t);
  const local = localTransports();
  const reached: string[] = [];
  const { link } = startLink(t, {
    ...local,
    program(target, ticket) {
      reached.push(`${target.kind} ${target.name}`);
      return local.program(target, ticket);
    },
  });

  await until(() => link.status().state === "up", "the chat server to be reached through them");

  assert.deepEqual(reached, ["chat chat"]);
});
