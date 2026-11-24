import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Versions } from "../contracts/gateway/index.ts";
import { gatewaySocket } from "../contracts/gateway/node.ts";
import { listen } from "../lib/link/node.ts";
import { backoff } from "../lib/retry/index.ts";
import { stopAfter, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { PI_PACKAGES, SHRIMPY_VERSION } from "../lib/version/index.ts";
import { homePaths } from "./home/index.ts";
import { startAgent } from "./index.ts";
import { closeAfter, fauxModels, SCOUT } from "./testing/index.ts";

/*
 * An agent its gateway turns away for the release it runs, against a stand-in gateway that turns every hello away
 * while running `versions`, and a stand-in `shrimpy` that writes down what it was asked to run.
 */

const timeout = 30_000;

/** Start an agent beside a gateway that runs `versions` and turns it away, and say what it asked its `shrimpy` to run, and how many hellos it said. */
async function turnedAwayBy(t: TestContext, versions: Versions) {
  useRuntimeDir(t);
  let hellos = 0;
  const gateway = await listen({ path: gatewaySocket() }, () => {
    hellos += 1;
    return { answer: { kind: "refused", words: "Another release.", reason: null, ...versions } };
  });
  stopAfter(t, () => gateway.close());

  const bin = tempDir(t, "bin");
  const asked = join(bin, "asked");
  const standIn = join(bin, "shrimpy.mjs");
  writeFileSync(standIn, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(asked)}, process.argv.slice(2).join(" ") + "\\n");\n`);

  const home = tempDir(t, "agent");
  writeFileSync(homePaths(home).config, JSON.stringify({ name: SCOUT }));
  closeAfter(
    t,
    await startAgent({
      home,
      name: SCOUT,
      ...fauxModels({ home }),
      shrimpy: [process.execPath, standIn],
      onReport: () => undefined,
      join: { backoff: () => backoff({ firstMs: 5, maxMs: 20 }) },
    }),
  );
  return {
    hellos: () => hellos,
    asked: (): string[] => (existsSync(asked) ? readFileSync(asked, "utf8").trim().split("\n") : []),
  };
}

const [major = 0, minor = 0] = SHRIMPY_VERSION.split(/[.-]/).map(Number);

test("an agent turned away by a gateway on a newer release with other Pi packages installs the gateway's version, once", { timeout }, async (t) => {
  const newer = `${String(major)}.${String(minor + 1)}.0`;
  const agent = await turnedAwayBy(t, { shrimpy: newer, pi: { ...PI_PACKAGES, "@earendil-works/chord": "999.0.0" } });

  await until(() => agent.asked().length > 0, "the agent to run shrimpy update");
  const later = agent.hellos() + 3;
  await until(() => agent.hellos() >= later, "the agent to say hello three more times");
  assert.deepEqual(agent.asked(), [`update ${newer}`]);
});

test("an agent turned away by a gateway on an older release it can't link with installs nothing", { timeout }, async (t) => {
  const older = `${SHRIMPY_VERSION.split("-")[0] ?? SHRIMPY_VERSION}-0`;
  const agent = await turnedAwayBy(t, { shrimpy: older, pi: { ...PI_PACKAGES, "@earendil-works/chord": "0.0.1" } });

  await until(() => agent.hellos() >= 5, "the agent to say hello five times");
  assert.deepEqual(agent.asked(), []);
});
