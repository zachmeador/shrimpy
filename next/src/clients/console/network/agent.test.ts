import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { SessionView } from "../../../contracts/agent/index.ts";
import { assistantItem, sessionView, startStandInAgent, userItem, workingView } from "../../../contracts/agent/testing/index.ts";
import { startStandInGateway } from "../../../contracts/gateway/testing/index.ts";
import { eventually, stopAfter, until, useRuntimeDir, within } from "../../../lib/testing/index.ts";
import { type AgentLink, keepAgent, type SessionUpdate } from "./agent.ts";
import { Down } from "./status.ts";
import { POLL_MS, quick, startRegistry } from "./testing/index.ts";
import { localTransports, type Transports } from "./transports.ts";

const timeout = 15_000;

/** A link to the agent called scout, which closes when the test ends. The test needs a gateway and a runtime directory. */
function startLink(t: TestContext, transports: Transports = localTransports()) {
  const registry = startRegistry(t, { transports });
  const updates: SessionUpdate[] = [];
  const link: AgentLink = keepAgent({
    name: "scout",
    registry,
    transports,
    pollMs: POLL_MS,
    backoff: quick(),
    onSession: (update) => updates.push(update),
  });
  stopAfter(t, () => link.close());
  return { link, updates };
}

/** The views of `threadId` that were passed on, oldest first. */
const viewsOf = (updates: SessionUpdate[], threadId: string): SessionView[] =>
  updates.flatMap((update) => (update.threadId === threadId && "view" in update ? [update.view] : []));

async function startAgent(t: TestContext) {
  useRuntimeDir(t);
  await startStandInGateway(t);
  return startStandInAgent(t, { name: "scout", register: true });
}

test("it watches the session behind a thread: its view, then each change to it", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const session = stand.agent.session("th_one", { view: sessionView({ items: [userItem("hello")] }) });
  const { link, updates } = startLink(t);

  link.watch("th_one");

  await eventually(() => viewsOf(updates, "th_one"), (views) => views.length > 0, { what: "the first view" });
  assert.deepEqual(viewsOf(updates, "th_one")[0]?.items, [userItem("hello")]);
  session.show(workingView([userItem("hello"), assistantItem("Looking", { streaming: true })], { kind: "answering" }));
  await eventually(() => viewsOf(updates, "th_one").at(-1), (view) => view?.status.busy === true, { what: "the change" });
  assert.equal(viewsOf(updates, "th_one").at(-1)?.items.at(-1)?.type, "assistant");
  assert.deepEqual(link.status(), { state: "up" });
});

test("an agent with no session for the thread yet has nothing to watch, which is no error, and it is watched once there is one", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const { link, updates } = startLink(t);
  await until(() => link.status().state === "up", "the agent to be reached");

  link.watch("th_new");
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));
  assert.deepEqual(updates, [], "nothing was reported");
  stand.agent.session("th_new", { view: sessionView({ items: [userItem("hi")] }) });

  await eventually(() => viewsOf(updates, "th_new"), (views) => views.length > 0, { what: "the session to be watched" });
  assert.deepEqual(updates.filter((update) => "problem" in update), []);
});

test("stopping reaches the session, says whether there was one, and fails with the agent's words when the agent refuses", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const session = stand.agent.session("th_one", { view: workingView([userItem("go")]) });
  const { link } = startLink(t);
  await until(() => link.status().state === "up", "the agent to be reached");

  link.watch("th_one");
  assert.equal(await link.stop(), true);
  link.watch("th_none");
  assert.equal(await link.stop(), false, "nothing to stop where the agent has no session");
  link.watch("th_one");
  session.failStops("the work would not stop");
  await assert.rejects(link.stop(), /the work would not stop/);

  assert.equal(session.stops, 2);
});

test("watching another thread lets go of the first, and watching none lets go too", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const first = stand.agent.session("th_one", { view: sessionView({ items: [userItem("one")] }) });
  stand.agent.session("th_two", { view: sessionView({ items: [userItem("two")] }) });
  const { link, updates } = startLink(t);

  link.watch("th_one");
  await eventually(() => viewsOf(updates, "th_one"), (views) => views.length > 0, { what: "the first session" });
  link.watch("th_two");
  await eventually(() => viewsOf(updates, "th_two"), (views) => views.length > 0, { what: "the second session" });
  const seen = updates.length;
  first.show(workingView([userItem("one")]));
  link.watch(undefined);
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 3));

  assert.equal(updates.length, seen, "nothing is passed on from a session that was let go of");
  assert.equal(await link.stop(), false, "and nothing is left to stop");
});

test("when the agent is lost it says so and stopping fails, and when it is back the session is watched again", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const session = stand.agent.session("th_one", { view: sessionView({ items: [userItem("hello")] }) });
  const { link, updates } = startLink(t);
  link.watch("th_one");
  await eventually(() => viewsOf(updates, "th_one"), (views) => views.length > 0, { what: "the first view" });

  await stand.outage();

  await until(() => link.status().state === "down", "the loss to be noticed");
  await assert.rejects(link.stop(), (error: unknown) => error instanceof Down);
  session.show(sessionView({ items: [userItem("hello"), assistantItem("Back.")] }));
  await stand.recover();
  await until(() => link.status().state === "up", "the agent to be reached again");

  await eventually(() => viewsOf(updates, "th_one").at(-1), (view) => view?.items.length === 2, { what: "the view after the loss" });
});

test("while the agent is not listed it says so, and it connects when the agent is", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t);
  const { link } = startLink(t);

  await until(() => JSON.stringify(link.status()) === JSON.stringify({ state: "down", why: { kind: "not-registered" } }), "the wait");
  await assert.rejects(link.stop(), (error: unknown) => error instanceof Down && error.why.kind === "not-registered");
  await startStandInAgent(t, { name: "scout", register: true });

  await until(() => link.status().state === "up", "the agent to be reached");
});

test("it reaches the agent through the transports it is handed", { timeout }, async (t) => {
  await startAgent(t);
  const local = localTransports();
  const reached: string[] = [];
  const { link } = startLink(t, {
    ...local,
    program(registration) {
      reached.push(`${registration.kind} ${registration.name}`);
      return local.program(registration);
    },
  });

  await until(() => link.status().state === "up", "the agent to be reached through them");

  assert.deepEqual(reached, ["agent scout"]);
});

test("closing hangs up at once, even while a session is being looked for", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const { link } = startLink(t);
  await until(() => link.status().state === "up", "the agent to be reached");
  link.watch("th_none");
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 2));

  await within(2000, link.close(), "closing");

  await until(() => stand.connections() === 0, "the connection to end");
});
