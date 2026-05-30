import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import shrimpyHeaderExtension from "../extensions/hello.ts";

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

test("Shrimpy TUI header uses package version metadata", async () => {
  let sessionStart:
    | ((_event: unknown, ctx: { ui: { setHeader(factory: HeaderFactory): void } }) => Promise<void>)
    | undefined;

  shrimpyHeaderExtension({
    on(event: string, handler: typeof sessionStart) {
      assert.equal(event, "session_start");
      sessionStart = handler;
    },
    registerCommand() {},
  } as never);

  let headerFactory: HeaderFactory | undefined;
  await sessionStart?.({}, {
    ui: {
      setHeader(factory: HeaderFactory): void {
        headerFactory = factory;
      },
    },
  });

  assert.ok(headerFactory);
  const rendered = headerFactory({}, identityTheme).render(120).join("\n");

  assert.match(rendered, new RegExp(escapeRegExp(expectedVersionLabel())));
  assert.doesNotMatch(rendered, /v0\.1\.0/);
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

function expectedVersionLabel(): string {
  const base = `${packageJson.name} v${packageJson.version}`;
  return packageJson.shrimpy?.releaseName
    ? `${base} - ${packageJson.shrimpy.releaseName}`
    : base;
}
