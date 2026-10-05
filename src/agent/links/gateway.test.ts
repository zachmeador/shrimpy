import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, type TestContext } from "node:test";
import type { Membership } from "../../contracts/agent/index.ts";
import { localTransports, newToken } from "../../contracts/gateway/node.ts";
import { startTestGateway } from "../../contracts/gateway/testing/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { stopAfter, until } from "../../lib/testing/index.ts";
import { joinGateway } from "./gateway.ts";

const timeout = 30_000;

/**
 * The gateway link of the agent called `name` whose home is `home`, with its
 * membership kept in memory: what it tells a person, how many times it has
 * tried to get in, and where it listens. It is stopped when the test ends.
 */
function agentAt(t: TestContext, home: string, name: string, membership?: Membership) {
  let kept = membership;
  const told: string[] = [];
  let attempts = 0;
  const reach = localTransports().gateway;
  const serverId = randomUUID();
  const link = joinGateway({
    name,
    listening: { serverId, socket: `/tmp/${name}-${serverId}.sock` },
    membership: {
      read: () => kept,
      save(next) {
        kept = next;
      },
    },
    files: { name: `${home}/agent.json`, membership: `${home}/state/member.json` },
    onError: (error) => told.push(error.message),
    transportFactory(handlers) {
      attempts++;
      return reach(handlers);
    },
    backoff: backoff({ firstMs: 5, maxMs: 20 }),
  });
  stopAfter(t, () => link.stop());
  return {
    link,
    serverId,
    told,
    attempts: () => attempts,
    membership: () => kept,
    /** Change what the home keeps, as an edit of its member file does. */
    keep(next: Membership) {
      kept = next;
    },
    files: (file: string) => `${home}/${file}`,
  };
}

test("a turned-away agent is told why once, with the advice that fits and the paths of its home, keeps trying, and takes the place of the agent it copies once that one stops", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const observer = await gateway.connect();
  const original = agentAt(t, "/homes/scout", "scout");
  await original.link.untilUp(AbortSignal.timeout(10_000));

  // A copy of the home, started with the name unchanged: it signs in, and the gateway refuses it when it registers.
  const copy = agentAt(t, "/homes/scout-copy", "scout", original.membership());
  await until(() => copy.attempts() >= 5, "the copy to be turned away again and again");
  assert.equal(copy.told.length, 1, "and told once");
  assert.ok(copy.told[0]?.includes(copy.files("state/member.json")) && copy.told[0].includes(copy.files("agent.json")));
  assert.equal(copy.link.current(), undefined);
  assert.equal((await observer.ticket({ kind: "agent", name: "scout" })).serverId, original.serverId, "the first is still the one reached");

  // The advice depends on the case: a token the roster does not have, and then, once the home has lost it, a name another member has.
  const visitor = agentAt(t, "/homes/visitor", "scout", { token: newToken(), memberId: "mem_000000000000" });
  await until(() => visitor.told.length === 1, "the visitor to be turned away");
  assert.ok(visitor.told[0]?.includes(visitor.files("state/member.json")) && !visitor.told[0].includes(visitor.files("agent.json")));
  visitor.keep({ token: newToken() });
  await until(() => visitor.told.length === 2, "the visitor to be turned away for its name");
  assert.ok(visitor.told[1]?.includes(visitor.files("agent.json")) && !visitor.told[1].includes(visitor.files("state/member.json")));

  await original.link.stop();
  await copy.link.untilUp(AbortSignal.timeout(10_000));
  assert.equal(copy.told.length, 1, "the copy joined as the agent without telling again");
  assert.equal((await observer.ticket({ kind: "agent", name: "scout" })).serverId, copy.serverId);
});
