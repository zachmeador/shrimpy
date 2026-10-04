import assert from "node:assert/strict";
import { test } from "node:test";
import type { Registration } from "../../contracts/gateway/index.ts";
import { registeredAgent } from "./agents.ts";

function program(kind: Registration["kind"], name: string, pid: number): Registration {
  return { kind, name, serverId: "00000000-0000-4000-8000-000000000000", socket: `/tmp/${name}.sock`, pid, version: "0.0.0" };
}

test("the agent with the name is found, and the newest of two is the one", () => {
  const programs = [program("agent", "scout", 1), program("chat", "chat", 2), program("agent", "scout", 3)];

  assert.equal(registeredAgent(programs, "scout").pid, 3);
});

test("a chat server with the name is not an agent", () => {
  assert.throws(() => registeredAgent([program("chat", "chat", 1)], "chat"), /^Error: No agent named chat is registered/);
});

test("with other agents registered, the error names them and says what to start", () => {
  const programs = [program("agent", "scout", 1), program("agent", "rex", 2), program("agent", "scout", 3)];

  assert.throws(
    () => registeredAgent(programs, "sout"),
    new Error(
      "No agent named sout is registered with this machine's gateway. Registered agents: scout, rex. " +
        "Start it with: shrimpy agent serve <home>, or start everything with: shrimpy up <home>... --data <dir>",
    ),
  );
});

test("with no agent registered, the error says so", () => {
  assert.throws(() => registeredAgent([], "scout"), /No agent is registered\. Start it with: shrimpy agent serve <home>/);
});
