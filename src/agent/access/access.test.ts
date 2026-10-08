import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { type Context, replicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type AgentConnection, connectAgent, type SessionService } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import { sessionView } from "../../contracts/agent/testing/index.ts";
import { gatewayAsAgent, joinRoster } from "../../contracts/chat/testing/index.ts";
import { type GatewayConnection, NEEDS_ADMIN, reachProgram } from "../../contracts/gateway/index.ts";
import { localTransports } from "../../contracts/gateway/node.ts";
import { isRefusal, reasonOf } from "../../lib/refusal/index.ts";
import { stopAfter } from "../../lib/testing/index.ts";
import { type AgentRig, startAgentRig } from "../testing/index.ts";
import { guardSession, withCaller } from "./access.ts";

/*
 * What a caller may do at an agent depends on how it came: by the home's path it
 * is the home's owner, and through the gateway it is whoever the gateway says.
 */

const timeout = 30_000;
const SCOUT = { kind: "agent", name: "scout" } as const;

const needsAdmin = (error: unknown): boolean => isRefusal(error) && reasonOf(error) === NEEDS_ADMIN;

/** Reach scout by its name through the gateway, as whoever the connection to the gateway is signed in as. */
async function reachScout(t: TestContext, gateway: GatewayConnection): Promise<AgentConnection> {
  const { connection } = await reachProgram({
    gateway,
    transports: localTransports(),
    target: SCOUT,
    connect: connectAgent,
    enter: (opened, ticket) => opened.enter(ticket),
  });
  stopAfter(t, () => connection.close().catch(() => undefined));
  return connection;
}

/** Read the session behind the DM's thread, steer it and wait for the answer, and stop it: what watching and controlling a session are. */
async function readSteerAndStop(connection: AgentConnection, rig: AgentRig): Promise<void> {
  assert.deepEqual((await connection.sessions()).map((session) => session.threadId), [rig.thread.id]);
  const session = await connection.attach(rig.thread.id);
  assert.ok(session.view.items.length > 0, "the session can be read");
  const { submission } = await session.steer("say hello without chat");
  assert.equal((await session.wait(submission)).status, "answered");
  await session.stop();
}

test("through the gateway, another agent may watch and control the agent's sessions only if it is an admin, and the agent itself always may", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("hello"));
  const person = await rig.chat.gateway.connect();
  const rex = await joinRoster(t, "rex");

  // An agent that is not an admin is refused every operation of the agent's API. Attaching a session comes before steering or stopping one, so that is refused too.
  const notAdmin = await reachScout(t, await gatewayAsAgent(t, "rex"));
  const calls = [
    () => notAdmin.sessions(),
    () => notAdmin.attach(rig.thread.id),
    () => notAdmin.models(),
    () => notAdmin.triggers(),
    () => notAdmin.trigger("nightly"),
    () => notAdmin.fire("nightly"),
    () => notAdmin.reload(),
  ];
  for (const call of calls) await assert.rejects(call, needsAdmin);

  // The agent itself, which signs in with the token its home keeps, may do all of it to its own sessions, and is no admin.
  const membership = readMembership(rig.home);
  assert.ok(membership?.memberId !== undefined, "the agent keeps the ID it knows itself by");
  // The first agent a roster has is an admin, and scout is the first. It is made an ordinary agent, so that it may for being the agent itself.
  await person.demote(membership.memberId);
  const ownGateway = await rig.chat.gateway.connect();
  await ownGateway.signIn(membership.token, null);
  assert.equal((await ownGateway.members()).find((member) => member.id === membership.memberId)?.admin, false);
  await readSteerAndStop(await reachScout(t, ownGateway), rig);

  // An agent that has been promoted may, the next time it comes in.
  assert.equal((await person.promote(rex.id)).admin, true);
  await readSteerAndStop(await reachScout(t, await gatewayAsAgent(t, "rex")), rig);
});

test("every call on a session is checked against whoever makes it, so that one a caller may not make never reaches the session", async () => {
  const reached: string[] = [];
  const reaching = (name: string) => () => {
    reached.push(name);
    return Promise.resolve();
  };
  const session: SessionService = {
    state: replicatedState(sessionView()),
    steer: () => {
      reached.push("steer");
      return Promise.resolve({ submission: 1 });
    },
    wait: () => {
      reached.push("wait");
      return Promise.resolve({ status: "cancelled" });
    },
    stop: reaching("stop"),
  };
  const guarded = guardSession(session);
  // Written out for every call, so that a call added to a session fails to compile here until it is checked.
  const calls: Record<Exclude<keyof SessionService, "state">, (context: Context) => Promise<unknown>> = {
    steer: (context) => guarded.steer("hello", null, context),
    wait: (context) => guarded.wait(1, context),
    stop: (context) => guarded.stop(context),
  };
  const asked = (kind: "person" | "agent"): Context =>
    withCaller(BACKGROUND_CONTEXT, {
      via: "gateway",
      member: { id: "mem_asking", kind, name: "rex" },
      admin: false,
      self: false,
      admins: [],
    });

  for (const [name, call] of Object.entries(calls)) {
    await assert.rejects(async () => call(asked("agent")), needsAdmin, `${name} was not checked`);
  }
  assert.deepEqual(reached, [], "and none of them reached the session");
  for (const call of Object.values(calls)) await call(asked("person"));
  assert.deepEqual(reached.toSorted(), ["steer", "stop", "wait"]);
});

test("by the home's path everything works, as it does with the gateway gone", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("hello"));
  await rig.chat.gateway.outage();

  const connection = await rig.connect();

  await readSteerAndStop(connection, rig);
  assert.deepEqual(await connection.triggers(), []);
  assert.equal((await connection.reload()).triggers, 0);
});
