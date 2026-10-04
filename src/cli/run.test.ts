import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "./index.ts";
import { captureIo } from "./testing/index.ts";

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out.join("\n"), err: cli.err.join("\n") };
}

test("with no command it lists the commands and exits with 2, and help lists them and exits with 0", async () => {
  const bare = await run();
  assert.equal(bare.code, 2);
  assert.match(bare.err, /^Usage: shrimpy <command>/);
  for (const command of ["up", "run", "agent serve"]) assert.ok(bare.err.includes(`  ${command} `), command);

  const help = await run("help");
  assert.equal(help.code, 0);
  assert.match(help.out, /^Usage: shrimpy <command>/);
  assert.equal(help.err, "");
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
    assert.match(result.err, /Commands:/);
  }
});

test("a command used wrongly exits with 2 and shows its usage", async () => {
  const cases: [string[], string][] = [
    [["agent", "init"], "Missing <home>."],
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
