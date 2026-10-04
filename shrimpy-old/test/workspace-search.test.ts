import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cmdWorkspace } from "../dist/commands/workspace.js";
import {
  setupInit,
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-workspace-search-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("workspace search", () => {
  test("searches the workspace knowledge corpus and refreshes the index lazily", async () => {
    await setupInit(workspace);
    writeMarkdown("agents/shrimpy/context/reef.md", "# Reef Plan\n\nCoral nursery research lives here.\n");
    writeMarkdown("channels/home.md", "# Channel Log\n\nCoral should not be indexed from channels.\n");

    const search = await captureLogs(() =>
      cmdWorkspace(["search", "coral nursery", "--json"], { workspace } as any)
    );

    assert.equal(search.result, 0);
    const payload = JSON.parse(search.lines.join("\n"));
    assert.equal(payload.matchedCount, 1);
    assert.equal(payload.results[0].path, "agents/shrimpy/context/reef.md");
    assert.equal(existsSync(payload.indexPath), true);

    const fresh = await captureLogs(() =>
      cmdWorkspace(["index", "status", "--json"], { workspace } as any)
    );
    const freshPayload = JSON.parse(fresh.lines.join("\n"));
    assert.equal(freshPayload.needsRebuild, false);
    assert.equal(freshPayload.staleFiles, 0);
    assert.equal(freshPayload.unindexedFiles, 0);

    writeMarkdown("agents/shrimpy/vault/research.md", "# Research\n\nCoral nursery follow-up.\n");
    const stale = await captureLogs(() =>
      cmdWorkspace(["index", "status", "--json"], { workspace } as any)
    );
    const stalePayload = JSON.parse(stale.lines.join("\n"));
    assert.equal(stalePayload.needsRebuild, true);
    assert.equal(stalePayload.unindexedFiles, 1);

    const rebuild = await captureLogs(() =>
      cmdWorkspace(["index", "rebuild", "--json"], { workspace } as any)
    );
    assert.equal(rebuild.result, 0);
    const rebuildPayload = JSON.parse(rebuild.lines.join("\n"));
    assert.equal(rebuildPayload.corpusFiles, stalePayload.corpusFiles);
    assert.equal(rebuildPayload.index.files.some((file: any) => file.path === "agents/shrimpy/vault/research.md"), true);
  });

  test("uses content-change time for recency and preserves it across mtime rewrites", async () => {
    await setupInit(workspace);
    const oldPath = writeMarkdown("agents/shrimpy/context/old.md", "# Old\n\nzyxrecencytoken shared note.\n");
    const freshPath = writeMarkdown("agents/shrimpy/context/fresh.md", "# Fresh\n\nzyxrecencytoken shared note.\n");
    const oldDate = new Date("2025-01-01T00:00:00.000Z");
    const freshDate = new Date("2026-01-01T00:00:00.000Z");
    utimesSync(oldPath, oldDate, oldDate);
    utimesSync(freshPath, freshDate, freshDate);

    const first = await captureLogs(() =>
      cmdWorkspace(["search", "zyxrecencytoken", "--json"], { workspace } as any)
    );
    const firstPayload = JSON.parse(first.lines.join("\n"));
    assert.equal(firstPayload.results[0].path, "agents/shrimpy/context/fresh.md");
    const oldIndexed = readIndexedFile("agents/shrimpy/context/old.md");
    assert.equal(oldIndexed.contentChangedAt, oldDate.toISOString());

    const rewrittenMtime = new Date("2026-05-01T00:00:00.000Z");
    utimesSync(oldPath, rewrittenMtime, rewrittenMtime);
    await captureLogs(() =>
      cmdWorkspace(["search", "zyxrecencytoken", "--json"], { workspace } as any)
    );
    const oldAfterRewrite = readIndexedFile("agents/shrimpy/context/old.md");
    assert.equal(oldAfterRewrite.lastModifiedAt, rewrittenMtime.toISOString());
    assert.equal(oldAfterRewrite.contentChangedAt, oldDate.toISOString());
  });

  test("filters agent knowledge while shared, global, and mechanic searches see their intended corpus", async () => {
    await setupInit(workspace);
    writeMarkdown(
      "context/shared.md",
      "# Shared\n\nscopevisibleworkspace common reference.\n",
    );
    writeMarkdown(
      "agents/shrimpy/context/private.md",
      "# Shrimpy\n\nscopevisibleshrimpy private reference.\n",
    );
    writeMarkdown(
      "agents/mechanic/context/private.md",
      "# Mechanic\n\nscopevisiblemechanic private reference.\n",
    );
    const config = {
      ...JSON.parse(
        readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
      ),
      workspace,
    };
    config.agents.push({
      id: "researcher",
      root: "agents/researcher",
      knowledgeScope: "global",
    });

    const own = await searchJson(
      ["search", "scopevisibleshrimpy", "--agent", "shrimpy", "--json"],
      config,
    );
    const foreign = await searchJson(
      ["search", "scopevisiblemechanic", "--agent", "shrimpy", "--json"],
      config,
    );
    const shared = await searchJson(
      ["search", "scopevisibleworkspace", "--agent", "shrimpy", "--json"],
      config,
    );
    const mechanic = await searchJson(
      ["search", "scopevisiblemechanic", "--agent", "mechanic", "--json"],
      config,
    );
    const explicitGlobal = await searchJson(
      ["search", "scopevisiblemechanic", "--agent", "researcher", "--json"],
      config,
    );

    assert.equal(own.results[0].path, "agents/shrimpy/context/private.md");
    assert.equal(foreign.returnedCount, 0);
    assert.equal(shared.results[0].path, "context/shared.md");
    assert.equal(mechanic.knowledgeScope, "global");
    assert.equal(mechanic.results[0].path, "agents/mechanic/context/private.md");
    assert.equal(explicitGlobal.knowledgeScope, "global");
    assert.equal(
      explicitGlobal.results[0].path,
      "agents/mechanic/context/private.md",
    );

    const index = JSON.parse(
      readFileSync(
        join(workspace, "runtime", "search", "workspace-index.json"),
        "utf-8",
      ),
    );
    assert.deepEqual(
      index.files.find((file: any) => file.path === "context/shared.md").visibility,
      { scope: "workspace" },
    );
    assert.deepEqual(
      index.files.find((file: any) =>
        file.path === "agents/mechanic/context/private.md"
      ).visibility,
      { scope: "agents", agentIds: ["mechanic"] },
    );
  });
});

async function searchJson(argv: string[], config: any): Promise<any> {
  const search = await captureLogs(() => cmdWorkspace(argv, config));
  assert.equal(search.result, 0);
  return JSON.parse(search.lines.join("\n"));
}

function writeMarkdown(path: string, content: string): string {
  const absolutePath = join(workspace, path);
  mkdirSync(join(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, content, "utf-8");
  return absolutePath;
}

function readIndexedFile(path: string): any {
  const index = JSON.parse(
    readFileSync(join(workspace, "runtime", "search", "workspace-index.json"), "utf-8"),
  );
  const file = index.files.find((entry: any) => entry.path === path);
  assert.ok(file, `missing indexed file: ${path}`);
  return file;
}
