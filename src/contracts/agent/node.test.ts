import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ConfigError } from "../../lib/json-config/index.ts";
import { startChild, tempDir } from "../../lib/testing/index.ts";
import { endpointFile } from "./endpoint.ts";
import { AgentNotRunningError, connectHome, readEndpoint } from "./node.ts";

function tempHome(t: TestContext): string {
  const home = tempDir(t, "node-door");
  mkdirSync(join(home, "runtime"));
  return home;
}

function recordEndpoint(home: string, socket: string): void {
  writeFileSync(endpointFile(home), JSON.stringify({ socket, name: "scout", pid: 1 }));
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

test("a socket that nothing answers on means no agent is running", async (t) => {
  const home = tempHome(t);
  const socket = join(home, "runtime", "stale.sock");
  await staleSocket(t, socket);
  recordEndpoint(home, socket);

  await assert.rejects(connectHome(home), AgentNotRunningError);
});

test("an endpoint file that cannot be read is an error, not a missing agent", (t) => {
  const home = tempHome(t);
  writeFileSync(endpointFile(home), "{ nope");
  assert.throws(() => readEndpoint(home), ConfigError);
});
