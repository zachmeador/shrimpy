import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { startChild, tempDir } from "../../lib/testing/index.ts";
import { endpointFile } from "./endpoint.ts";
import { AgentNotRunningError, attachLocal, readEndpoint } from "./node.ts";

function tempHome(t: TestContext): string {
  const home = tempDir(t, "node-door");
  mkdirSync(join(home, "runtime"));
  return home;
}

function recordEndpoint(home: string, socket: string): void {
  writeFileSync(endpointFile(home), JSON.stringify({ serverId: "11111111-1111-4111-8111-111111111111", socket, pid: 1 }));
}

/** A socket file with nothing behind it, the way a killed agent leaves one. */
async function staleSocket(t: TestContext, path: string): Promise<void> {
  const source = `
    import { createServer } from "node:net";
    createServer().listen(${JSON.stringify(path)}, () => console.log(JSON.stringify({ event: "listening" })));
  `;
  const child = await startChild(t, { source });
  await child.kill("SIGKILL");
}

test("a home that no agent ever served has no endpoint and no agent", async (t) => {
  const home = tempHome(t);
  assert.equal(readEndpoint(home), undefined);
  await assert.rejects(attachLocal(home), new AgentNotRunningError(home));
});

test("an endpoint whose socket is gone means no agent is running", async (t) => {
  const home = tempHome(t);
  recordEndpoint(home, join(home, "runtime", "gone.sock"));

  assert.equal(readEndpoint(home)?.pid, 1);
  await assert.rejects(attachLocal(home), (error: unknown) => {
    assert.ok(error instanceof AgentNotRunningError);
    assert.equal(error.message, `No agent is running at ${home}.`);
    return true;
  });
});

test("a socket that nothing answers on means no agent is running", async (t) => {
  const home = tempHome(t);
  const socket = join(home, "runtime", "stale.sock");
  await staleSocket(t, socket);
  recordEndpoint(home, socket);

  await assert.rejects(attachLocal(home), AgentNotRunningError);
});

test("an endpoint file that cannot be read is an error, not a missing agent", (t) => {
  const home = tempHome(t);
  writeFileSync(endpointFile(home), "{ nope");
  assert.throws(() => readEndpoint(home), SyntaxError);
});
