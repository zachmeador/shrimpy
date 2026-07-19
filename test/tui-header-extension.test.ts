import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createShrimpyHeaderExtensionFactory } from "../dist/tui/shrimpy-header.js";

interface PackageJson {
  name: string;
  version: string;
  shrimpy?: {
    releaseName?: string;
  };
}

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf-8"),
) as PackageJson;

test("Shrimpy TUI header shares its logo line with the live agent identity", async () => {
  let sessionStart:
    | ((_event: unknown, ctx: {
      mode: string;
      ui: { setHeader(factory: HeaderFactory): void };
    }) => Promise<void>)
    | undefined;

  createShrimpyHeaderExtensionFactory(() => "beta")({
    on(event: string, handler: typeof sessionStart) {
      assert.equal(event, "session_start");
      sessionStart = handler;
    },
    registerCommand() {},
  } as never);

  let headerFactory: HeaderFactory | undefined;
  await sessionStart?.({}, {
    mode: "tui",
    ui: {
      setHeader(factory: HeaderFactory): void {
        headerFactory = factory;
      },
    },
  });

  assert.ok(headerFactory);
  const header = headerFactory({}, identityTheme);
  const lines = header.render(120);
  const rendered = lines.join("\n");

  assert.match(lines[0]!, /^shrimpy  ·  agent beta  ·  /);
  assert.match(rendered, new RegExp(escapeRegExp(expectedReleaseLabel())));
  assert.match(lines[0]!, /agent beta/);
  assert.equal(lines.length, 2);
  assert.doesNotMatch(rendered, /v0\.1\.0/);

  const narrowLines = header.render(24);
  assert.equal(narrowLines.length, 2);
  assert.match(narrowLines[0]!, /agent beta/);
  assert.equal(narrowLines.every((line) => visibleWidth(line) <= 24), true);
});

interface HeaderFactory {
  (tui: unknown, theme: typeof identityTheme): { render(width: number): string[] };
}

const identityTheme = {
  bold(text: string): string {
    return text;
  },
  fg(_color: string, text: string): string {
    return text;
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectedReleaseLabel(): string {
  const base = `v${packageJson.version}`;
  return packageJson.shrimpy?.releaseName
    ? `${base} - ${packageJson.shrimpy.releaseName}`
    : base;
}
