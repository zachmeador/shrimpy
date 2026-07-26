import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatShrimpyTerminalTitle,
  installShrimpyTerminalTitle,
} from "../dist/tui/terminal-title.js";

test("Shrimpy terminal titles show the active agent and cwd", () => {
  assert.equal(
    formatShrimpyTerminalTitle({
      agentId: "mechanic",
      cwd: "/Users/shrimpy/gits/coral-reef",
    }),
    "🦐 - Agent: mechanic - cwd: coral-reef",
  );
  assert.equal(
    formatShrimpyTerminalTitle({ agentId: "mechanic", cwd: "/" }),
    "🦐 - Agent: mechanic - cwd: /",
  );
});

test("the terminal adapter applies live agent identity to every Pi title reset", () => {
  const titles: string[] = [];
  let target = {
    agentId: "shrimpy",
    cwd: "/Users/shrimpy/gits/shrimpy",
  };
  const interactive = {
    ui: {
      terminal: {
        setTitle(title: string): void {
          titles.push(title);
        },
      },
    },
  };

  installShrimpyTerminalTitle(
    interactive as never,
    () => target,
  );
  interactive.ui.terminal.setTitle("π - local/main - workspace");
  target = {
    agentId: "mechanic",
    cwd: "/Users/shrimpy/gits/maintenance",
  };
  interactive.ui.terminal.setTitle("π - release - workspace");

  assert.deepEqual(titles, [
    "🦐 - Agent: shrimpy - cwd: shrimpy",
    "🦐 - Agent: mechanic - cwd: maintenance",
  ]);
});
