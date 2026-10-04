import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cmdUpdateWithDeps,
} from "../dist/commands/update.js";
import type { ShrimpyInstallMetadata } from "../dist/app/install-metadata.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let root: string;
let workspace: string;
let appRoot: string;

const currentCommit = "1111111111111111111111111111111111111111";
const targetCommit = "2222222222222222222222222222222222222222";

beforeEach(() => {
  root = makeTempWorkspace("shrimpy-update-command-test-");
  workspace = join(root, "workspace");
  appRoot = join(root, "app");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(appRoot, { recursive: true });
  writeFileSync(join(appRoot, "package.json"), JSON.stringify({
    name: "shrimpy",
    version: "0.5.0",
    description: "test",
  }), "utf-8");
});

afterEach(() => {
  removeTempWorkspace(root);
});

describe("cmdUpdate", () => {
  test("reports the exact tagged release in non-interactive JSON", async () => {
    const deps = updateDeps();
    const { result, lines } = await captureLogs(() =>
      cmdUpdateWithDeps(["--dry-run", "--json"], { workspace } as any, deps)
    );

    assert.equal(result, 0);
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.install.managed, true);
    assert.equal(payload.install.currentVersion, "0.5.0");
    assert.equal(payload.target.tag, "v0.6.0");
    assert.equal(payload.target.commit, targetCommit);
    assert.equal(
      payload.applyCommand,
      `shrimpy update apply --tag v0.6.0 --commit ${targetCommit}`,
    );
    assert.equal(payload.mechanic.usable, true);
  });

  test("bare update opens a mechanic TUI with update guidance and context", async () => {
    const result = await cmdUpdateWithDeps(
      [],
      { workspace } as any,
      updateDeps(),
    );

    assert.equal(typeof result, "object");
    if (typeof result !== "object") return;
    assert.equal(result.kind, "shrimpy-tui");
    assert.equal(result.request.agentId, "mechanic");
    assert.equal(result.request.skills, undefined);
    assert.equal(result.request.basePromptResources?.length, 1);
    assert.match(
      result.request.basePromptResources?.[0]?.rootPath ?? "",
      /src\/skills\/included\/shrimpy-update$/,
    );
    assert.equal(
      result.request.basePromptResources?.[0]?.resourcePath,
      "SKILL.md",
    );
    assert.match(result.request.initialMessage ?? "", /Update Shrimpy from v0\.5\.0/);
    assert.match(result.request.initialMessage ?? "", /to v0\.6\.0/);
    assert.match(
      result.request.initialMessage ?? "",
      /Do this skill: .*src\/skills\/included\/shrimpy-update\/SKILL\.md/,
    );
    assert.doesNotMatch(
      result.request.initialMessage ?? "",
      /present one concrete update plan/i,
    );
    assert.match(
      result.request.initialMessage ?? "",
      new RegExp(`shrimpy update apply --tag v0\\.6\\.0 --commit ${targetCommit}`),
    );
  });

  test("no newer tag exits without opening a mechanic", async () => {
    const deps = updateDeps({
      resolveReleases: () => [{
        tag: "v0.5.0",
        version: "0.5.0",
        commit: currentCommit,
      }],
    });
    const { result, lines } = await captureLogs(() =>
      cmdUpdateWithDeps([], { workspace } as any, deps)
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /already the newest tagged release/);
  });

  test("explains that source-development checkouts update through Git", async () => {
    const deps = updateDeps({
      readInstallMetadata: () => undefined,
      readGitState: () => ({
        commit: currentCommit,
        ref: "main",
        dirty: true,
      }),
    });
    const { result, lines } = await captureLogs(() =>
      cmdUpdateWithDeps(
        ["--dry-run", "--json"],
        { workspace } as any,
        deps,
      )
    );

    assert.equal(result, 1);
    const payload = JSON.parse(lines.join("\n"));
    assert.deepEqual(payload.problems, [
      `This is a source-development checkout: ${appRoot}. shrimpy update manages tagged release installs only; use Git and the repository build workflow here.`,
    ]);
  });

  test("apply uses the exact approved tag and commit", async () => {
    let applied = false;
    const deps = updateDeps({
      applyRelease: (input) => {
        applied = true;
        assert.equal(input.release.tag, "v0.6.0");
        assert.equal(input.expectedCommit, targetCommit);
        return {
          tag: input.release.tag,
          commit: input.release.commit,
          previousRef: "v0.5.0",
          previousCommit: currentCommit,
          appRoot,
          rolledBack: false,
          mechanicCheck: "passed",
        };
      },
    });

    const { result, lines } = await captureLogs(() =>
      cmdUpdateWithDeps(
        ["apply", "--tag", "v0.6.0", "--commit", targetCommit, "--json"],
        { workspace } as any,
        deps,
      )
    );

    assert.equal(result, 0);
    assert.equal(applied, true);
    assert.equal(JSON.parse(lines.join("\n")).mechanicCheck, "passed");
  });

  test("apply refuses while a gateway owns the workspace", async () => {
    let applied = false;
    const deps = updateDeps({
      findGatewayPid: () => 4242,
      applyRelease: () => {
        applied = true;
        throw new Error("should not run");
      },
    });
    const { result, errors } = await captureLogs(() =>
      cmdUpdateWithDeps(
        ["apply", "--tag", "v0.6.0", "--commit", targetCommit],
        { workspace } as any,
        deps,
      )
    );

    assert.equal(result, 1);
    assert.equal(applied, false);
    assert.match(errors.join("\n"), /gateway still owns this workspace \(PID 4242\)/);
  });

  test("check-mechanic reports bootstrap failures as JSON", async () => {
    const deps = updateDeps({
      checkMechanic: async () => {
        throw new Error("missing update skill");
      },
    });
    const { result, lines } = await captureLogs(() =>
      cmdUpdateWithDeps(
        ["check-mechanic", "--json"],
        { workspace } as any,
        deps,
      )
    );

    assert.equal(result, 1);
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.usable, false);
    assert.match(payload.problems.join("\n"), /missing update skill/);
  });
});

function updateDeps(
  overrides: Record<string, unknown> = {},
): any {
  const metadata: ShrimpyInstallMetadata = {
    schemaVersion: 1,
    managed: true,
    installDir: appRoot,
    origin: "https://example.test/shrimpy.git",
    requestedRef: "v0.5.0",
    installedRef: "v0.5.0",
    installedCommit: currentCommit,
  };
  return {
    appRoot,
    binaryTarget: join(appRoot, "dist", "cli.js"),
    readInstallMetadata: () => metadata,
    resolveReleases: () => [
      {
        tag: "v0.6.0",
        version: "0.6.0",
        commit: targetCommit,
      },
      {
        tag: "v0.5.0",
        version: "0.5.0",
        commit: currentCommit,
      },
    ],
    checkMechanic: async () => undefined,
    readGitState: () => ({
      commit: currentCommit,
      ref: "v0.5.0",
      dirty: false,
    }),
    findGatewayPid: () => null,
    readGatewayStatus: () => ({
      manager: "launchd",
      serviceName: "test",
      active: "active",
      enabled: "installed",
    }),
    ...overrides,
  };
}
