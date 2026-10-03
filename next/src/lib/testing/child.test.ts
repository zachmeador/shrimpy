import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { startChild, tempDir, useRuntimeDir } from "./index.ts";

const testing = new URL("./index.ts", import.meta.url).href;

/** A child that prints `line` and then idles until it is stopped. */
const idle = (line: object): string => `
  console.log(${JSON.stringify(JSON.stringify(line))});
  setInterval(() => {}, 1000);
`;

test("a child is started, and the JSON line it prints says it is ready", async (t) => {
  const child = await startChild<{ event: string }>(t, { source: idle({ event: "ready" }) });

  assert.deepEqual(child.line, { event: "ready" });
  assert.ok(child.pid > 0);
  assert.equal(child.process.pid, child.pid);
});

test("a script file runs with the arguments it is given", async (t) => {
  const script = join(tempDir(t, "child"), "args.mjs");
  writeFileSync(script, "console.log(JSON.stringify({ args: process.argv.slice(2) }));\n");

  const child = await startChild<{ args: string[] }>(t, { file: script, args: ["one", "two"] });

  assert.deepEqual(child.line.args, ["one", "two"]);
});

test("a child gets the test's runtime directory", async (t) => {
  const directory = useRuntimeDir(t);
  const source = "console.log(JSON.stringify({ dir: process.env.SHRIMPY_RUNTIME_DIR }));";

  const child = await startChild<{ dir: string }>(t, { source });

  assert.equal(child.line.dir, directory);
});

test("killing a child waits until it has gone, and killing it again does nothing", async (t) => {
  const child = await startChild(t, { source: idle({ ready: true }) });

  await child.kill("SIGKILL");
  assert.equal(child.process.signalCode, "SIGKILL");

  await child.kill("SIGKILL");
});

test("a child is stopped with SIGTERM unless told otherwise", async (t) => {
  const child = await startChild(t, { source: idle({ ready: true }) });

  await child.kill();

  assert.equal(child.process.signalCode, "SIGTERM");
});

test("a child that is still running when the test ends is killed", async (t) => {
  let pid = 0;

  await t.test("a test that leaves a child running", async (inner) => {
    pid = (await startChild(inner, { source: idle({ ready: true }) })).pid;
    process.kill(pid, 0);
  });

  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});

test("a child that ends before it prints a line is an error saying how it ended", async (t) => {
  await assert.rejects(
    startChild(t, { source: "process.exit(3)" }),
    /The child ended \(3\) before it printed a line/,
  );
  await assert.rejects(
    startChild(t, { source: "process.kill(process.pid, 'SIGKILL')" }),
    /The child ended \(SIGKILL\) before it printed a line/,
  );
});

test("a child that prints something that is not JSON is an error showing the line", async (t) => {
  await assert.rejects(
    startChild(t, { source: "console.log('listening'); setInterval(() => {}, 1000);" }),
    /The child printed a line that is not JSON: listening/,
  );
});

test("a fixture run until it is stopped says it is ready, and closes when told to stop", async (t) => {
  const marker = join(tempDir(t, "child"), "closed");
  const source = `
    import { writeFileSync } from "node:fs";
    import { runUntilStopped } from ${JSON.stringify(testing)};
    await runUntilStopped(
      async () => ({ close: async () => writeFileSync(${JSON.stringify(marker)}, "closed") }),
      () => ({ event: "ready" }),
    );
  `;
  const child = await startChild<{ event: string }>(t, { source });
  assert.deepEqual(child.line, { event: "ready" });
  assert.equal(existsSync(marker), false);

  await child.kill("SIGTERM");

  assert.equal(child.process.exitCode, 0);
  assert.equal(existsSync(marker), true);
});

test("a fixture run until it is stopped survives a stop request that comes while it starts", async (t) => {
  const marker = join(tempDir(t, "child"), "closed");
  const source = `
    import { writeFileSync } from "node:fs";
    import { runUntilStopped } from ${JSON.stringify(testing)};
    await runUntilStopped(
      async () => {
        process.kill(process.pid, "SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { close: async () => writeFileSync(${JSON.stringify(marker)}, "closed") };
      },
      () => ({ event: "ready" }),
    );
  `;

  const child = await startChild<{ event: string }>(t, { source });
  const [code, signal] = (await once(child.process, "exit")) as [number | null, NodeJS.Signals | null];

  assert.deepEqual(child.line, { event: "ready" });
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.equal(existsSync(marker), true);
});
