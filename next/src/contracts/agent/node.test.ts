import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { endpointFile } from "./endpoint.ts";
import { AgentNotRunningError, attachLocal, readEndpoint } from "./node.ts";

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-node-door-"));
  mkdirSync(join(home, "runtime"));
  return home;
}

function recordEndpoint(home: string, socket: string): void {
  writeFileSync(endpointFile(home), JSON.stringify({ serverId: "11111111-1111-4111-8111-111111111111", socket, pid: 1 }));
}

/** A socket file with nothing behind it, the way a killed agent leaves one. */
async function staleSocket(path: string): Promise<void> {
  const script = `
    import { createServer } from "node:net";
    createServer().listen(${JSON.stringify(path)}, () => console.log("listening"));
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    await once(child.stdout, "data");
  } finally {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

test("a home that no agent ever served has no endpoint and no agent", async () => {
  const home = tempHome();
  assert.equal(readEndpoint(home), undefined);
  await assert.rejects(attachLocal(home), new AgentNotRunningError(home));
});

test("an endpoint whose socket is gone means no agent is running", async () => {
  const home = tempHome();
  recordEndpoint(home, join(home, "runtime", "gone.sock"));

  assert.equal(readEndpoint(home)?.pid, 1);
  await assert.rejects(attachLocal(home), (error: unknown) => {
    assert.ok(error instanceof AgentNotRunningError);
    assert.equal(error.message, `No agent is running at ${home}.`);
    return true;
  });
});

test("a socket that nothing answers on means no agent is running", async () => {
  const home = tempHome();
  const socket = join(home, "runtime", "stale.sock");
  await staleSocket(socket);
  recordEndpoint(home, socket);

  await assert.rejects(attachLocal(home), AgentNotRunningError);
});

test("an endpoint file that cannot be read is an error, not a missing agent", () => {
  const home = tempHome();
  writeFileSync(endpointFile(home), "{ nope");
  assert.throws(() => readEndpoint(home), SyntaxError);
});
