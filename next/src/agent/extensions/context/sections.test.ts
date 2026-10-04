import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember } from "../../../contracts/chat/index.ts";
import type { HomeSnapshot } from "../../home/index.ts";
import { messageTools } from "../tools/index.ts";
import { baseInstructions } from "./base.ts";
import { renderSections } from "./sections.ts";

const agent = { name: "scout", home: "/agents/scout" };

const empty: HomeSnapshot = { soul: undefined, files: [], skills: [], leftOut: [] };

const full: HomeSnapshot = {
  soul: "\n# SOUL\n\nBe brief.\n\n",
  files: [
    { path: "context/user.md", text: "Zach likes short answers.\n" },
    { path: 'context/"quoted".md', text: "  indented\n" },
  ],
  skills: [
    { name: "review", description: "Review a diff for bugs.", file: "/agents/scout/skills/review/SKILL.md" },
    { name: "ship-it", description: "Ship a build.", file: "/agents/scout/skills/deploy/SKILL.md" },
  ],
  leftOut: [{ file: "skills/broken/SKILL.md", reason: "its front matter has no description" }],
};

test("a home with nothing in it still gives the agent what every agent is told", () => {
  assert.deepEqual(renderSections(agent, empty), [
    { key: "shrimpy", text: `<shrimpy>\n${baseInstructions(agent)}\n</shrimpy>` },
  ]);
});

test("the sections come in a fixed order: what every agent is told, SOUL.md, the context files, the skills", () => {
  const sections = renderSections(agent, full);

  assert.deepEqual(
    sections.map((section) => section.key),
    ["shrimpy", "soul", "context", "skills"],
  );
  assert.equal(sections[1]?.text, "<soul>\n# SOUL\n\nBe brief.\n</soul>");
  assert.equal(
    sections[2]?.text,
    [
      "<context>",
      '<file path="context/user.md">',
      "Zach likes short answers.",
      "</file>",
      '<file path="context/&quot;quoted&quot;.md">',
      "indented",
      "</file>",
      "</context>",
    ].join("\n"),
  );
  assert.equal(
    sections[3]?.text,
    [
      "<skills>",
      "- review: Review a diff for bugs.",
      "  /agents/scout/skills/review/SKILL.md",
      "- ship-it: Ship a build.",
      "  /agents/scout/skills/deploy/SKILL.md",
      "</skills>",
    ].join("\n"),
  );
});

test("a section with nothing to say is left out, and the others keep their places", () => {
  const keys = (snapshot: HomeSnapshot): string[] => renderSections(agent, snapshot).map((section) => section.key);

  assert.deepEqual(keys({ ...full, soul: undefined }), ["shrimpy", "context", "skills"]);
  assert.deepEqual(keys({ ...full, soul: " \n" }), ["shrimpy", "context", "skills"]);
  assert.deepEqual(keys({ ...full, files: [] }), ["shrimpy", "soul", "skills"]);
  assert.deepEqual(keys({ ...full, skills: [] }), ["shrimpy", "soul", "context"]);
});

test("the files that were left out are not in any section", () => {
  const text = renderSections(agent, full)
    .map((section) => section.text)
    .join("\n");

  assert.doesNotMatch(text, /broken/);
});

test("the same snapshot gives the same sections every time, and the snapshot is not touched", () => {
  const before = JSON.stringify(full);

  assert.deepEqual(renderSections(agent, full), renderSections(agent, full));
  assert.equal(JSON.stringify(full), before);
});

test("what every agent is told names the agent, its home and every message tool the agent has", () => {
  const text = baseInstructions(agent);

  assert.match(text, /^You are scout, /);
  assert.ok(text.includes("/agents/scout"));
  const installed = messageTools({ self: agentMember("scout"), chat: () => undefined });
  const tools = (installed.tools ?? []).map((tool) => tool.name);
  assert.deepEqual(tools, ["send_message", "read_messages"]);
  for (const name of tools) assert.ok(text.includes(name), `the instructions don't name ${name}`);
});
