import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  archiveActiveSession,
  archiveSessionFile,
  findActiveSessionId,
  listArchivedSessionFiles,
  restoreArchivedSession,
} from "../dist/sessions/transcript-store.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-session-transcript-store-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("session transcript store", () => {
  test("reads the concrete id of the active transcript without opening it", () => {
    const sessionDir = join(testDir, "sessions", "shrimpy", "tui");
    mkdirSync(sessionDir, { recursive: true });
    const sessionFile = join(sessionDir, "state.jsonl");
    writeSessionFile(sessionFile);

    assert.equal(findActiveSessionId(sessionDir), sessionFile);
    archiveActiveSession(sessionDir);
    assert.equal(findActiveSessionId(sessionDir), undefined);
  });

  test("archives the active session JSONL in place", () => {
    const sessionDir = join(testDir, "sessions", "shrimpy", "tui");
    mkdirSync(sessionDir, { recursive: true });
    const sessionFile = join(sessionDir, "state.jsonl");
    writeSessionFile(sessionFile);

    const archivedTo = archiveActiveSession(sessionDir);
    assert.equal(archivedTo, sessionFile);
    assert.equal(existsSync(sessionDir), true);
    assert.equal(existsSync(sessionFile), true);
    assert.match(readFileSync(sessionFile, "utf-8"), /"state":"archived"/);
  });

  test("archives a specific session JSONL file", () => {
    const sessionDir = join(testDir, "sessions", "shrimpy", "tui");
    mkdirSync(sessionDir, { recursive: true });
    const oldFile = join(sessionDir, "old.jsonl");
    const newFile = join(sessionDir, "new.jsonl");
    writeSessionFile(oldFile);
    writeSessionFile(newFile);

    const archivedTo = archiveSessionFile(oldFile);

    assert.equal(archivedTo, oldFile);
    assert.deepEqual(listArchivedSessionFiles(sessionDir), [oldFile]);
    assert.match(readFileSync(oldFile, "utf-8"), /"state":"archived"/);
    assert.doesNotMatch(readFileSync(newFile, "utf-8"), /"state":"archived"/);
  });

  test("lists archived session files for one session root newest first", async () => {
    const sessionDir = join(testDir, "sessions", "shrimpy", "tui");
    mkdirSync(sessionDir, { recursive: true });
    const one = join(sessionDir, "one.jsonl");
    const two = join(sessionDir, "two.jsonl");
    writeSessionFile(one);
    archiveActiveSession(sessionDir);
    await new Promise((resolve) => setTimeout(resolve, 2));

    writeSessionFile(two);
    archiveActiveSession(sessionDir);

    const archived = listArchivedSessionFiles(sessionDir);
    assert.equal(archived.length, 2);
    assert.equal(archived[0], two);
    assert.equal(archived[1], one);
  });

  test("restores the newest archived session and archives the current active file", async () => {
    const sessionDir = join(testDir, "sessions", "shrimpy", "tui");
    mkdirSync(sessionDir, { recursive: true });
    const oldFile = join(sessionDir, "old.jsonl");
    const currentFile = join(sessionDir, "current.jsonl");
    writeSessionFile(oldFile);
    archiveActiveSession(sessionDir);
    await new Promise((resolve) => setTimeout(resolve, 2));

    writeSessionFile(currentFile);

    const restored = restoreArchivedSession(sessionDir);
    assert.ok(restored);
    assert.equal(restored!.restoredFrom, oldFile);
    assert.equal(restored!.archivedPreviousTo, currentFile);
    assert.match(readFileSync(oldFile, "utf-8"), /"state":"active"/);
    assert.match(readFileSync(currentFile, "utf-8"), /"state":"archived"/);
  });
});

function writeSessionFile(path: string): void {
  const now = new Date().toISOString();
  writeFileSync(
    path,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: path,
      timestamp: now,
      cwd: testDir,
    })}\n${JSON.stringify({
      type: "message",
      id: "root",
      parentId: null,
      timestamp: now,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        api: "test",
        provider: "test",
        model: "test",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    })}\n`,
    "utf-8",
  );
}
