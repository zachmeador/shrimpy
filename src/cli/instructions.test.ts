import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { previewHomeContext } from "../agent/index.ts";
import { loadAll } from "./commands/index.ts";
import { runCli } from "./index.ts";
import { captureIo, commandLines, useShrimpyDir, whyNotACommand } from "./testing/index.ts";

/*
 * What agents are told about Shrimpy's commands has to stay true of the commands
 * there are. This reads the instructions, each skill that ships and what
 * `agent init` prints, finds every `shrimpy` command line in them, and holds each
 * to the CLI's own catalog of commands and flags.
 */
test("every shrimpy command line in what an agent is told is a command the CLI has", async (t) => {
  const init = captureIo();
  assert.equal(await runCli(["agent", "init", "scout", "--model", "local/test-model"], init.io), 0);
  const home = join(useShrimpyDir(t), "agents", "scout");

  const { sections, leftOut } = await previewHomeContext(home);
  assert.deepEqual(leftOut, [], "every skill that ships is written right");
  const texts = new Map<string, string>([["what agent init prints", init.out.join("\n")]]);
  texts.set("the instructions", sections.find((section) => section.key === "shrimpy")?.text ?? "");
  const trails = sections.find((section) => section.key === "skills")?.text ?? "";
  for (const [, file = ""] of trails.matchAll(/^ {2}(\/\S.*SKILL\.md)$/gm)) texts.set(file, await readFile(file, "utf8"));
  assert.equal(texts.size, 8, "the instructions, what init prints and the six skills");

  const commands = await loadAll();
  const problems: string[] = [];
  for (const [where, text] of texts) {
    const lines = commandLines(text);
    assert.notEqual(lines.length, 0, `${where} names no command, so there is nothing to check`);
    for (const line of lines) {
      const why = whyNotACommand(line, commands);
      if (why !== undefined) problems.push(`${where}: ${line} (${why})`);
    }
  }
  assert.deepEqual(problems, []);
});
