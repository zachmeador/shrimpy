import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAll } from "./commands/index.ts";
import { runCli } from "./index.ts";
import { captureIo, useShrimpyDir } from "./testing/index.ts";

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out.join("\n"), err: cli.err.join("\n") };
}

test("with no command it lists the commands and exits with 2, and help lists them and exits with 0, in the order of their groups, with where the Shrimpy folder is", async (t) => {
  const folder = useShrimpyDir(t);
  const commands = await loadAll();

  const bare = await run();
  const help = await run("help");

  assert.equal(bare.code, 2);
  assert.equal(help.code, 0);
  assert.equal(help.err, "");
  for (const text of [bare.err, help.out]) {
    const places = commands.map((command) => text.indexOf(`\n  ${command.name}`));
    assert.ok(places.every((at) => at > 0), `every command is listed:\n${text}`);
    assert.deepEqual(places, places.toSorted((a, b) => a - b), "in the order of the groups: using Shrimpy first");
    assert.ok(text.includes(folder), "and it says where the Shrimpy folder is");
  }
});

test("with no command at a terminal it opens the console instead, and its result is the exit code", async () => {
  const cli = captureIo({ terminal: true });
  let opened = 0;

  const result = await runCli([], cli.io, {
    openConsole: () => {
      opened += 1;
      return Promise.resolve(1);
    },
  });

  assert.deepEqual([result, opened, cli.err, cli.out], [1, 1, [], []]);
});

test("an unknown command is refused with the list of commands, and so is a name that is only a property of plain objects", async () => {
  for (const args of [["nope"], ["agent", "nope"], ["constructor"]]) {
    const result = await run(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.err, /^Unknown command: /);
    assert.ok(result.err.includes("\n  up "), "and the list of commands follows it");
  }
});

test("a command used wrongly exits with 2 and shows its usage", async () => {
  const cases: [string[], string][] = [
    [["agent", "init"], "Missing <agent>."],
    [["agent", "init", "scout"], "Missing --model."],
    [["agent", "serve", "h", "--fast"], "Unknown option '--fast'"],
    [["sessions", "steer", "h", "th_1", "one", "two"], "Unexpected argument: two."],
    [["run", "scout", "   "], "The text is empty."],
  ];
  for (const [args, expected] of cases) {
    const result = await run(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.ok(result.err.includes(expected), `${args.join(" ")} -> ${result.err}`);
    assert.match(result.err, /\nUsage: shrimpy [a-z]+/);
  }
});
