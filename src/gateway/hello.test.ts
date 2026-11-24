import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { hello, HelloRefusedError, readAnswer, Roster } from "../contracts/gateway/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { dial, type DialPlace } from "../lib/link/node.ts";
import { until } from "../lib/testing/index.ts";
import { PI_PACKAGES, SHRIMPY_VERSION } from "../lib/version/index.ts";
import { connectTestClient, linkTestAgent } from "../contracts/gateway/testing/index.ts";
import { startGatewayInProcess } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

/** What the gateway at `place` answers `said`, which is sent as it is; the connection is dropped after. */
async function answerTo(place: DialPlace, said: unknown) {
  const { answer, linked } = await dial(place, said as Parameters<typeof dial>[1]);
  linked.drop();
  const read = readAnswer(answer);
  assert.ok(read !== undefined, "the answer is one the contract knows");
  return read;
}

test("a hello on other Pi packages is turned away in words that say what each side runs, whatever else it says", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const other = Object.fromEntries(Object.keys(PI_PACKAGES).map((name) => [name, "9.9.9"]));

  const answer = await answerTo({ path: gateway.socket }, { shrimpy: "9.0.0", pi: other, who: { kind: "from-a-later-release" } });

  assert.equal(answer.kind, "refused");
  assert.equal(answer.reason, null);
  assert.match(answer.words, /9\.9\.9/);
  assert.deepEqual(answer.pi, PI_PACKAGES, "the answer carries the gateway's own");
});

test("a hello of another major is turned away in words that name the machine to update and the version to update it to", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const later = `${Number(SHRIMPY_VERSION.split(".")[0]) + 1}.0.0`;

  const program = await answerTo({ path: gateway.socket }, { ...hello({ kind: "agent", name: "scout", token: newToken(), roster: null }), shrimpy: later });
  assert.equal(program.kind, "refused");
  assert.ok(program.words.includes("gateway's machine") && program.words.includes(later), program.words);
  assert.equal(program.shrimpy, SHRIMPY_VERSION, "the answer carries the gateway's own version");

  const client = await answerTo({ path: gateway.socket }, { ...hello({ kind: "client", token: null }), shrimpy: later });
  assert.equal(client.kind, "refused", "a client of another major too");
});

test("the roster lists an agent turned away for its release, with what it runs, until it links", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const place = { path: gateway.socket };
  const token = newToken();
  const scout = await linkTestAgent(t, "scout", { place, token });
  await scout.stop();
  const you = await connectTestClient(t, place);
  const roster = await you.host.get(Roster, {}, context);
  const later = `${Number(SHRIMPY_VERSION.split(".")[0]) + 1}.0.0`;

  const answer = await answerTo(place, { ...hello({ kind: "agent", name: "scout", token, roster: scout.roster }), shrimpy: later });
  assert.equal(answer.kind, "refused");
  await until(() => roster.turnedAway.value.length === 1, "the roster to list scout as turned away");
  assert.deepEqual(roster.turnedAway.value, [{ kind: "agent", name: "scout", member: scout.you.id, shrimpy: later, pi: PI_PACKAGES }]);

  await linkTestAgent(t, "scout", { place, token });
  await until(() => roster.turnedAway.value.length === 0, "scout to leave the list once it links");
});

test("a second program for one agent is turned away while the first is linked", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const place = { path: gateway.socket };
  const token = newToken();
  const scout = await linkTestAgent(t, "scout", { place, token });
  await until(() => scout.welcomes.length === 1, "scout to be let in");

  const answer = await answerTo(place, hello({ kind: "agent", name: "scout", token, roster: scout.roster }));
  assert.equal(answer.kind === "refused" ? answer.reason : answer.kind, "agent_running");

  const you = await connectTestClient(t, place);
  const roster = await you.host.get(Roster, {}, context);
  await until(() => roster.members.value.some((member) => member.name === "scout" && member.reachable), "scout to be reachable");
  assert.equal(scout.welcomes.length, 1, "the first is undisturbed");
});

test("an agent joins over the entry with an invitation's code, once, and then links in there with its token", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const [address] = gateway.listening;
  assert.ok(address);
  const you = await connectTestClient(t, { path: gateway.socket });
  const roster = await you.host.get(Roster, {}, context);
  const invitation = await roster.invite({ name: "crab" }, context);
  if (invitation.kind !== "done") throw new Error(invitation.words);
  assert.deepEqual(invitation.value.addresses, [address]);
  assert.equal(invitation.value.fingerprint, gateway.fingerprint, "with the fingerprint of the gateway's key");
  const entry = { ...address, fingerprint: invitation.value.fingerprint };
  const join = (token: string, code: string) => hello({ kind: "join", name: "crab", token, code, machine: "elsewhere" });

  const wrong = await answerTo(entry, join(newToken(), "AAAA-AAAA"));
  assert.equal(wrong.kind, "refused");
  const token = newToken();
  const joined = await answerTo(entry, join(token, invitation.value.code));
  assert.equal(joined.kind === "welcome" ? joined.you?.name : joined.words, "crab");
  const again = await answerTo(entry, join(newToken(), invitation.value.code));
  assert.equal(again.kind, "refused", "the code is good once");
  await assert.rejects(
    connectTestClient(t, entry, newToken()),
    (error) => error instanceof HelloRefusedError && error.reason === "unknown_token",
    "and a token nobody joined with opens nothing",
  );

  await linkTestAgent(t, "crab", { place: entry, token });
  await until(() => roster.members.value.some((member) => member.name === "crab" && member.reachable), "crab to link in");
});

test("an agent beside the gateway whose token was taken back is refused as unknown_token, reclaims its entry with a fresh token, and does not resurrect after removal", { timeout }, async (t) => {
  const gateway = await startGatewayInProcess(t);
  const place = { path: gateway.socket };
  const token = newToken();
  const scout = await linkTestAgent(t, "scout", { place, token });
  assert.ok(scout.roster !== null);
  const you = await connectTestClient(t, place);
  const roster = await you.host.get(Roster, {}, context);
  assert.equal(roster.id.value, scout.roster);

  await until(() => roster.ways.value.some((way) => way.member === scout.you.id), "scout's way to be listed");
  const way = roster.ways.value.find((each) => each.member === scout.you.id);
  assert.ok(way !== undefined);
  assert.equal((await roster.takeBack({ way: way.id }, context)).kind, "done");
  await scout.stop();

  // Presenting the same roster ID with a revoked token tells the gateway it knew this roster already: refuse as unknown_token.
  const revoked = await answerTo(place, hello({ kind: "agent", name: "scout", token, roster: scout.roster }));
  assert.equal(revoked.kind === "refused" ? revoked.reason : revoked.kind, "unknown_token");

  // Deleting state/member.json (a fresh token with roster: null) on the gateway's socket reclaims the tokenless entry.
  const replacementToken = newToken();
  const reclaimed = await answerTo(place, hello({ kind: "agent", name: "scout", token: replacementToken, roster: null }));
  assert.equal(reclaimed.kind, "welcome");
  assert.equal(reclaimed.you?.id, scout.you.id, "same member ID");

  // Once scout has a token again, another home asking for the same name is refused as name_taken.
  const duplicate = await answerTo(place, hello({ kind: "agent", name: "scout", token: newToken(), roster: null }));
  assert.equal(duplicate.kind === "refused" ? duplicate.reason : duplicate.kind, "name_taken");

  // After removal, presenting this roster's ID does not silently recreate the removed agent.
  assert.equal((await roster.remove({ member: scout.you.id }, context)).kind, "done");
  const removed = await answerTo(place, hello({ kind: "agent", name: "scout", token: replacementToken, roster: scout.roster }));
  assert.equal(removed.kind === "refused" ? removed.reason : removed.kind, "unknown_token");
  assert.equal(roster.members.value.some((member) => member.name === "scout"), false);

  // Presenting a different roster ID (such as after the gateway's roster was wiped and recreated) joins the fresh roster.
  const fresh = await answerTo(place, hello({ kind: "agent", name: "scout", token: newToken(), roster: "ros_otherroster00" }));
  assert.equal(fresh.kind, "welcome");
  assert.equal(fresh.you?.name, "scout");
  assert.equal(fresh.roster, roster.id.value);
  assert.notEqual(fresh.you.id, scout.you.id, "a new agent taking a freed name gets a fresh ID");
});
