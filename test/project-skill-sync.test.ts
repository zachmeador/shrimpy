import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLAUDE_INSTRUCTIONS_ORIGIN_NOTE,
  PROJECT_SKILL_MANAGED_MARKER,
  defaultProjectSkillSourceDir,
  listProjectSkillSourceBundles,
  syncClaudeInstructions,
  syncProjectSkills,
} from "../dist/skills/project-sync.js";

describe("project skill sync", () => {
  test("uses root skills as the default source directory", () => {
    assert.equal(defaultProjectSkillSourceDir().endsWith("/skills"), true);
    assert.equal(defaultProjectSkillSourceDir().endsWith("/src/skills"), false);
  });

  test("copies source skill bundles to managed project targets", () => {
    const root = mkdtempSync(join(tmpdir(), "shrimpy-project-skill-sync-"));
    try {
      const sourceDir = join(root, "src-skills");
      const claudeTarget = join(root, ".claude", "skills");
      const agentsTarget = join(root, ".agents", "skills");
      writeSkill(sourceDir, "alpha", "Alpha body.");
      writeSkill(sourceDir, "beta", "Beta body.");
      writeFileSync(join(sourceDir, "index.ts"), "export {};\n", "utf-8");
      mkdirSync(join(sourceDir, "not-a-skill"), { recursive: true });

      const result = syncProjectSkills({
        sourceDir,
        targets: [
          { name: "claude", rootPath: claudeTarget },
          { name: "agents", rootPath: agentsTarget },
        ],
      });

      assert.deepEqual(result.skills, ["alpha", "beta"]);
      for (const target of [claudeTarget, agentsTarget]) {
        assert.equal(existsSync(join(target, PROJECT_SKILL_MANAGED_MARKER)), true);
        assert.match(
          readFileSync(join(target, PROJECT_SKILL_MANAGED_MARKER), "utf-8"),
          /Edit repository skills under skills\/ instead\./,
        );
        assert.match(
          readFileSync(join(target, "alpha", "SKILL.md"), "utf-8"),
          /Alpha body\./,
        );
        assert.match(
          readFileSync(join(target, "beta", "SKILL.md"), "utf-8"),
          /Beta body\./,
        );
        assert.equal(existsSync(join(target, "index.ts")), false);
        assert.equal(existsSync(join(target, "not-a-skill")), false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("removes stale generated skills on the next sync", () => {
    const root = mkdtempSync(join(tmpdir(), "shrimpy-project-skill-stale-"));
    try {
      const sourceDir = join(root, "src-skills");
      const target = join(root, ".agents", "skills");
      writeSkill(sourceDir, "first", "First body.");
      syncProjectSkills({ sourceDir, targets: [{ name: "agents", rootPath: target }] });
      rmSync(join(sourceDir, "first"), { recursive: true, force: true });
      writeSkill(sourceDir, "second", "Second body.");

      syncProjectSkills({ sourceDir, targets: [{ name: "agents", rootPath: target }] });

      assert.equal(existsSync(join(target, "first")), false);
      assert.equal(existsSync(join(target, "second", "SKILL.md")), true);
      assert.equal(existsSync(join(target, PROJECT_SKILL_MANAGED_MARKER)), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite unmanaged target directories", () => {
    const root = mkdtempSync(join(tmpdir(), "shrimpy-project-skill-unmanaged-"));
    try {
      const sourceDir = join(root, "src-skills");
      const target = join(root, ".claude", "skills");
      writeSkill(sourceDir, "alpha", "Alpha body.");
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, "manual.txt"), "manual\n", "utf-8");

      assert.throws(
        () => syncProjectSkills({ sourceDir, targets: [{ name: "claude", rootPath: target }] }),
        /refusing to replace unmanaged project skill target/,
      );
      assert.equal(readFileSync(join(target, "manual.txt"), "utf-8"), "manual\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("lists only direct source directories with SKILL.md", () => {
    const root = mkdtempSync(join(tmpdir(), "shrimpy-project-skill-list-"));
    try {
      const sourceDir = join(root, "src-skills");
      writeSkill(sourceDir, "alpha", "Alpha body.");
      mkdirSync(join(sourceDir, "nested", "child"), { recursive: true });
      writeSkill(join(sourceDir, "nested"), "child", "Nested child body.");
      writeFileSync(join(sourceDir, "service.ts"), "export {};\n", "utf-8");

      const bundles = listProjectSkillSourceBundles(sourceDir);

      assert.deepEqual(bundles.map((bundle) => bundle.id), ["alpha"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("copies AGENTS.md into CLAUDE.md with an origin note", () => {
    const root = mkdtempSync(join(tmpdir(), "shrimpy-project-claude-sync-"));
    try {
      const sourcePath = join(root, "AGENTS.md");
      const targetPath = join(root, "CLAUDE.md");
      writeFileSync(sourcePath, "# Agents\n\nUse concise instructions.\n", "utf-8");

      const result = syncClaudeInstructions({ sourcePath, targetPath });

      assert.deepEqual(result, { sourcePath, targetPath });
      assert.equal(
        readFileSync(targetPath, "utf-8"),
        `${CLAUDE_INSTRUCTIONS_ORIGIN_NOTE}\n\n# Agents\n\nUse concise instructions.\n`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function writeSkill(sourceDir: string, id: string, body: string): void {
  const root = join(sourceDir, id);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "SKILL.md"),
    [
      "---",
      `name: ${id}`,
      `description: Test skill ${id}.`,
      "---",
      "",
      body,
      "",
    ].join("\n"),
    "utf-8",
  );
}
