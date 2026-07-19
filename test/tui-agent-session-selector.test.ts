import { initTheme } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { theme } from "../dist/app/pi-internals.js";
import { AgentSessionSelectorComponent } from "../dist/tui/agent-session-selector.js";

beforeEach(() => {
  initTheme("dark", false);
});

test("agent/session selector traverses the hierarchy with all four arrow keys", () => {
  const selected: unknown[] = [];
  const selector = new AgentSessionSelectorComponent(
    inventory(),
    theme,
    20,
    (session) => selected.push(session),
    () => {},
  );

  assert.deepEqual(selectedRow(selector), ["session", "alpha", "local/main"]);

  selector.handleInput("\x1b[D");
  assert.deepEqual(selectedRow(selector), ["agent", "alpha"]);
  selector.handleInput("\x1b[D");
  assert.doesNotMatch(selector.render(120).join("\n"), /Alpha main/);

  selector.handleInput("\x1b[C");
  assert.deepEqual(selectedRow(selector), ["agent", "alpha"]);
  assert.match(selector.render(120).join("\n"), /Alpha main/);
  selector.handleInput("\x1b[C");
  assert.deepEqual(selectedRow(selector), ["session", "alpha", "local/main"]);

  selector.handleInput("\x1b[B");
  assert.deepEqual(selectedRow(selector), ["session", "alpha", "local/research"]);
  selector.handleInput("\x1b[B");
  assert.deepEqual(selectedRow(selector), ["agent", "beta"]);
  selector.handleInput("\x1b[C");
  assert.deepEqual(selectedRow(selector), ["session", "beta", "local/main"]);

  selector.handleInput("\x1b[A");
  assert.deepEqual(selectedRow(selector), ["agent", "beta"]);
  selector.handleInput("\x1b[A");
  assert.deepEqual(selectedRow(selector), ["session", "alpha", "local/research"]);
  selector.handleInput("\r");
  assert.equal((selected[0] as { sessionId: string }).sessionId, "local/research");
});

test("agent/session selector filters sessions while retaining their parent agent", () => {
  let cancelled = 0;
  const selector = new AgentSessionSelectorComponent(
    inventory(),
    theme,
    20,
    () => {},
    () => cancelled += 1,
  );

  for (const character of "research") selector.handleInput(character);
  const rendered = selector.render(120).join("\n");
  assert.match(rendered, /alpha/);
  assert.match(rendered, /Research reef/);
  assert.doesNotMatch(rendered, /Alpha main/);
  assert.doesNotMatch(rendered, /beta/);

  selector.handleInput("\x1b[D");
  assert.deepEqual(selectedRow(selector), ["agent", "alpha"]);
  selector.handleInput("\x1b[C");
  assert.deepEqual(selectedRow(selector), ["session", "alpha", "local/research"]);

  selector.handleInput("\x1b");
  assert.equal(selector.getSearchQuery(), "");
  assert.equal(cancelled, 0);
  assert.match(selector.render(120).join("\n"), /Alpha main/);
  selector.handleInput("\x1b");
  assert.equal(cancelled, 1);
});

test("agent/session selector renders Pi-style discovery and current-state cues", () => {
  const selector = new AgentSessionSelectorComponent(
    inventory(),
    theme,
    20,
    () => {},
    () => {},
  );
  const rendered = selector.render(120).join("\n");

  assert.match(rendered, /Agents & Sessions/);
  assert.match(rendered, /↑\/↓.*move/);
  assert.match(rendered, /←\/→.*parent\/child/);
  assert.match(rendered, /Type to search/);
  assert.match(rendered, /active/);
  assert.match(rendered, /current/);
  assert.match(rendered, /no sessions · open local\/main/);
});

test("selecting an agent with no sessions requests a new local chat", () => {
  const selected: string[] = [];
  const selector = new AgentSessionSelectorComponent(
    inventory(),
    theme,
    20,
    () => {},
    () => {},
    "empty",
    (agent) => selected.push(agent.agentId),
  );

  assert.deepEqual(selectedRow(selector), ["agent", "empty"]);
  selector.handleInput("\r");
  assert.deepEqual(selected, ["empty"]);
});

function selectedRow(selector: AgentSessionSelectorComponent): string[] {
  const row = selector.getSelectedRow() as any;
  return row.kind === "agent"
    ? [row.kind, row.agent.agentId]
    : [row.kind, row.agent.agentId, row.session.sessionId];
}

function inventory() {
  const now = Date.now();
  return {
    sessionCount: 3,
    agents: [
      {
        agentId: "alpha",
        current: true,
        sessions: [
          session("alpha", "local/main", "Alpha main", now, true),
          session("alpha", "local/research", "Research reef", now - 1_000, false),
        ],
      },
      {
        agentId: "beta",
        current: false,
        sessions: [
          session("beta", "local/main", "Beta main", now - 2_000, false),
        ],
      },
      { agentId: "empty", current: false, sessions: [] },
    ],
  };
}

function session(
  agentId: string,
  sessionId: string,
  name: string,
  updatedAtMs: number,
  current: boolean,
) {
  return {
    agentId,
    sessionId,
    name,
    purpose: "interactive",
    path: `/tmp/${agentId}/${sessionId}.jsonl`,
    sessionDir: `/tmp/${agentId}/${sessionId}`,
    updatedAt: new Date(updatedAtMs).toISOString(),
    updatedAtMs,
    current,
  };
}
