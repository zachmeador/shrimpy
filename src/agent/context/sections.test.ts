import assert from "node:assert/strict";
import { test } from "node:test";
import type { HomeSnapshot } from "../home/index.ts";
import { messageTools } from "../message-tools/durable.ts";
import { askTools } from "../questions/durable.ts";
import { wakeupTools } from "../wakeups/durable.ts";
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

test("the sections come in a fixed order, each in a tag of its own, and a file path cannot break out of its tag", () => {
  const sections = renderSections(agent, full);

  assert.deepEqual(
    sections.map((section) => section.key),
    ["shrimpy", "soul", "context", "skills"],
  );
  assert.ok(sections.every((section) => section.text.startsWith(`<${section.key}>\n`) && section.text.endsWith(`\n</${section.key}>`)));
  assert.ok(sections[2]?.text.includes('<file path="context/&quot;quoted&quot;.md">'));
  assert.ok(sections[3]?.text.includes("- review: Review a diff for bugs.\n  /agents/scout/skills/review/SKILL.md"));
  assert.doesNotMatch(sections.map((section) => section.text).join("\n"), /broken/, "what was left out is in no section");
});

test("a section with nothing to say is left out, and the others keep their places", () => {
  const keys = (snapshot: HomeSnapshot): string[] => renderSections(agent, snapshot).map((section) => section.key);

  assert.deepEqual(keys(empty), ["shrimpy"], "a home with nothing in it still gives the agent what every agent is told");
  assert.deepEqual(keys({ ...full, soul: " \n" }), ["shrimpy", "context", "skills"]);
  assert.deepEqual(keys({ ...full, files: [] }), ["shrimpy", "soul", "skills"]);
  assert.deepEqual(keys({ ...full, skills: [] }), ["shrimpy", "soul", "context"]);
});

test("what every agent is told names the agent, its home and every tool of its own the agent has", () => {
  const text = baseInstructions(agent);

  assert.match(text, /^You are scout, /);
  assert.ok(text.includes("/agents/scout"));
  const installed = [
    messageTools({ recordsId: "rec_test", chat: () => undefined, gateway: () => undefined }),
    wakeupTools({ wakeups: { set: () => Promise.reject(new Error("The tools are only listed here.")) } }),
    askTools({
      questions: {
        find: () => Promise.reject(new Error("The tools are only listed here.")),
        count: () => Promise.reject(new Error("The tools are only listed here.")),
        keep: () => Promise.reject(new Error("The tools are only listed here.")),
      },
      recordsId: "rec_test",
      chat: () => undefined,
      gateway: () => undefined,
    }),
  ];
  const tools = installed.flatMap((extension) => (extension.tools ?? []).map((tool) => tool.name));
  assert.deepEqual(tools, ["send_message", "read_messages", "check_back", "ask_agent"]);
  for (const name of tools) assert.ok(text.includes(name), `the instructions don't name ${name}`);
});
