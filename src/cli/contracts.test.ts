import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Contract, Host, ParamsOf } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Agent, AgentPresence, Session } from "../contracts/agent/index.ts";
import { Channel, Chat, ChatPresence, Thread } from "../contracts/chat/index.ts";
import { Notifications, type Principal, type Revocation, Roster, WorkspaceContext } from "../contracts/gateway/index.ts";
import { eventually } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { declareLocalModel, serve, shrimpy, startTalking, untilLinked, useShrimpyDir } from "./testing/index.ts";

/*
 * Programs of one major link, so the program that serves a contract keeps serving every version of it that a release
 * of the major shipped. src/contracts/released.json has each release's contracts, each by its name, at the version and
 * with the fingerprint that release served. A release writes its own down; the first test fails at a release until it
 * has, and says what to write.
 *
 * A contract that changes after a release gets its next version with Chord's evolve, from the declaration the release
 * shipped. That declaration stays, and goes in DECLARATIONS below, so the second test can hold it from the real
 * programs, as a program of that release would.
 */

/** Every declaration of every contract that a release of this major may have shipped, and the params to hold one by. */
const DECLARATIONS = [
  declared(Roster, () => ({})),
  declared(Notifications, () => ({})),
  declared(WorkspaceContext, () => ({})),
  declared(Chat, () => ({})),
  declared(Channel, () => ({ channel: "ch_none" })),
  declared(Thread, () => ({ thread: "th_none" })),
  declared(ChatPresence, () => ({})),
  declared(Agent, (agent) => ({ agent })),
  declared(Session, (agent) => ({ agent, session: "th_none" })),
  declared(AgentPresence, (agent) => ({ agent })),
];

/** A declaration, and its params for an agent with member ID `agent`. */
function declared<C extends Contract>(type: C, params: (agent: string) => ParamsOf<C>) {
  return { type, hold: (host: Host<Principal, Revocation>, agent: string) => host.hold(type, params(agent), BACKGROUND_CONTEXT) };
}

/** A contract as a release served it. */
type Served = { version: number; fingerprint: string };

const released = JSON.parse(readFileSync(new URL("../contracts/released.json", import.meta.url), "utf8")) as Record<string, Record<string, Served>>;

/** A release's number, such as `1.2.0`, as against a build between releases, such as `1.3.0-dev`, or one from before 1.0.0. */
const isRelease = (version: string): boolean => /^\d+\.\d+\.\d+$/.test(version) && !version.startsWith("0.");

const majorOf = (version: string): string => version.split(".")[0] ?? "";

/** The current declaration of each contract, as this release serves it. */
const current = (): Record<string, Served> =>
  Object.fromEntries(
    DECLARATIONS.filter(({ type }) => !DECLARATIONS.some((other) => other.type.name === type.name && other.type.version > type.version)).map(
      ({ type }) => [type.name, { version: type.version, fingerprint: type.fingerprint }],
    ),
  );

test("a release has every contract it serves written down", { skip: !isRelease(SHRIMPY_VERSION) && "a build between releases writes nothing down" }, () => {
  const ours = current();
  assert.deepEqual(
    released[SHRIMPY_VERSION],
    ours,
    `Write this release's contracts down in src/contracts/released.json:\n${JSON.stringify({ [SHRIMPY_VERSION]: ours }, null, 2)}`,
  );
});

const shipped = Object.entries(released).filter(([release]) => majorOf(release) === majorOf(SHRIMPY_VERSION));

test(
  "every contract a release of this major shipped is still declared as it was, and the programs serve it",
  { timeout: 90_000, skip: shipped.length === 0 && `no release of major ${majorOf(SHRIMPY_VERSION)} is written down yet` },
  async (t) => {
    for (const [release, contracts] of shipped) {
      for (const [name, served] of Object.entries(contracts)) {
        const found = DECLARATIONS.find(({ type }) => type.name === name && type.version === served.version);
        assert.ok(found, `${name} version ${served.version}, which ${release} shipped, has no declaration any more: keep it, and evolve the next from it`);
        assert.equal(found.type.fingerprint, served.fingerprint, `${name} version ${served.version} changed since ${release} shipped it: give the change a new version`);
      }
    }

    const talking = await startTalking(t);
    assert.equal((await shrimpy(["agent", "init", "scout", "--model", "local/test-model"])).code, 0);
    // Nothing here asks the model anything.
    declareLocalModel(join(useShrimpyDir(t), "agents", "scout"), { url: "http://127.0.0.1:9/v1", model: "test-model" });
    await serve(t, join(useShrimpyDir(t), "agents", "scout"));
    const scout = await untilLinked("agent", "scout");
    const you = await talking.gateway.connect();
    for (const [release, contracts] of shipped) {
      for (const [name, served] of Object.entries(contracts)) {
        const found = DECLARATIONS.find(({ type }) => type.name === name && type.version === served.version);
        const held = found?.hold(you.host, scout.member ?? "");
        try {
          await eventually(() => held?.state.value.kind, (kind) => kind === "live", { what: `${name} version ${served.version}, which ${release} shipped, to be served` });
        } finally {
          held?.release();
        }
      }
    }
  },
);
