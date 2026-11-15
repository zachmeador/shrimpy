import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type Member, Roster } from "../contracts/gateway/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { tempDir, until } from "../lib/testing/index.ts";
import { connectTestClient, startTestAgent, startTestGateway } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

/** Who you are and who the people on the roster are, as you see them through a client on the gateway's socket. */
async function asSeen(t: TestContext, socket: string): Promise<{ you: Member | null; people: string[] }> {
  const client = await connectTestClient(t, { path: socket });
  const roster = await client.host.get(Roster, {}, context);
  const seen = { you: roster.you.value, people: roster.members.value.filter((member) => member.kind === "person").map((member) => member.id) };
  roster.release();
  await client.close();
  return seen;
}

test("you are made once with the gateway's data, and stay the same you under another account", { timeout }, async (t) => {
  const dataDir = tempDir(t, "gateway-data");
  const first = await startTestGateway(t, { dataDir, account: "first-account" });
  const before = await asSeen(t, first.socket);
  assert.equal(before.you?.name, "first-account");
  await first.close();

  const again = await startTestGateway(t, { dataDir, account: "another-account" });

  const after = await asSeen(t, again.socket);
  assert.deepEqual(after.you, before.you, "the same member, by the same name");
  assert.deepEqual(after.people, [before.you.id], "and the only person");
});

test("a roster that holds a second person is refused, with words that name both", { timeout }, async (t) => {
  const dataDir = tempDir(t, "gateway-data");
  const file = join(dataDir, "state", "roster.json");
  mkdirSync(dirname(file), { recursive: true });
  const people = [
    { id: "mem_first", kind: "person", name: "first", recognizedBy: {} },
    { id: "mem_second", kind: "person", name: "second", recognizedBy: {} },
  ];
  writeFileSync(file, JSON.stringify({ version: 2, members: people }));

  await assert.rejects(
    startTestGateway(t, { dataDir }),
    (error) => error instanceof Error && error.message.includes("mem_first") && error.message.includes("mem_second"),
  );
});

test("the name your settings give you shows at once in the roster everyone holds, and stays when the file is gone", { timeout }, async (t) => {
  const dataDir = tempDir(t, "gateway-data");
  const settings = join(tempDir(t, "folder"), "settings.json");
  const first = await startTestGateway(t, { dataDir, account: "first-account", settings });
  const client = await connectTestClient(t, { path: first.socket });
  const roster = await client.host.get(Roster, {}, context);
  assert.equal(roster.you.value?.name, "first-account", "the account's name, while there is no file");

  writeFileSync(settings, JSON.stringify({ name: "Zach" }));

  await until(() => roster.you.value?.name === "Zach", "your new name in the roster you hold");
  assert.deepEqual(roster.members.value.filter((member) => member.kind === "person").map((member) => member.name), ["Zach"]);
  roster.release();
  await first.close();
  rmSync(settings);
  const again = await startTestGateway(t, { dataDir, account: "another-account", settings });
  assert.equal((await asSeen(t, again.socket)).you?.name, "Zach");
});

test("a name another member has is refused where the gateway reports problems, and your name stays", { timeout }, async (t) => {
  const reported = t.mock.method(console, "error", () => undefined);
  const settings = join(tempDir(t, "folder"), "settings.json");
  const gateway = await startTestGateway(t, { account: "first-account", settings });
  await startTestAgent(t, { place: { path: gateway.socket }, name: "scout", token: newToken() });
  const client = await connectTestClient(t, { path: gateway.socket });
  const roster = await client.host.get(Roster, {}, context);
  await until(() => roster.members.value.some((member) => member.name === "scout"), "scout to join");

  writeFileSync(settings, JSON.stringify({ name: "Scout" }));

  const said = (): string[] => reported.mock.calls.map((call) => call.arguments.join(" ")).filter((line) => line.includes(settings));
  await until(() => said().length > 0, "the gateway to say why");
  assert.equal(roster.you.value?.name, "first-account");
  assert.deepEqual(roster.members.value.map((member) => member.name), ["first-account", "scout"]);
});
