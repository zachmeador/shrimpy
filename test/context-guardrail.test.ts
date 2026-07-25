import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["src", "extensions"];
const ALLOWED_PREFIXES = [
  normalize("src/context/"),
  normalize("src/setup/templates/"),
];
const PROMPT_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "context path wrapper", pattern: /<context path=/ },
  { name: "turn context header", pattern: /\[turn-context\]/ },
  { name: "channel header", pattern: /\[channel:/ },
  { name: "image marker", pattern: /\[Image:/ },
  { name: "system marker", pattern: /\[System:/ },
  { name: "available skills heading", pattern: /## Available Skills/ },
  { name: "runtime environment heading", pattern: /## Runtime Environment/ },
  { name: "delivery heading", pattern: /## Delivery/ },
  { name: "send_message delivery instruction", pattern: /send_message\(channel=/ },
  { name: "tool prompt snippet property", pattern: /promptSnippet:/ },
  { name: "compaction instruction text", pattern: /Preserve approximate time anchors/ },
  { name: "compaction summarizer prompt", pattern: /context summarization assistant/ },
  {
    name: "user-assistant-only compaction framing",
    pattern: /between a user and an AI coding assistant/,
  },
  { name: "single-user compaction goal", pattern: /What is the user trying/ },
  { name: "single-user compaction constraints", pattern: /mentioned by user/ },
  { name: "single-user turn prefix", pattern: /What did the user ask/ },
];

describe("context construction guardrail", () => {
  test("keeps model-facing prompt framing inside src/context", () => {
    const violations: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of walk(join(ROOT, root))) {
        const normalized = normalize(relative(ROOT, file));
        if (isAllowed(normalized)) continue;
        const text = readFileSync(file, "utf-8");
        for (const { name, pattern } of PROMPT_PATTERNS) {
          if (pattern.test(text)) {
            violations.push(`${normalized}: ${name}`);
          }
        }
      }
    }

    assert.deepEqual(violations, []);
  });

  test("compaction extension imports context-owned instructions", () => {
    const extension = readFileSync(
      join(ROOT, "src", "sessions", "compaction", "extension.ts"),
      "utf-8",
    );

    assert.match(extension, /context\/system\/compaction\.js/);
    assert.doesNotMatch(extension, /Preserve approximate time anchors/);
  });
});

function isAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function normalize(path: string): string {
  return path.split(sep).join("/");
}

function walk(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path));
    } else if (/\.(ts|js|md|json|sh)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}
