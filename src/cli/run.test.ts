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

/** The names a front page lists, each in the column before its description: `agent ...` is the group agent. */
function namesOn(page: string): Set<string> {
  const names = new Set<string>();
  for (const line of page.split("\n")) {
    const [listed = "", description] = line.trim().split(/ {2,}/);
    if (description === undefined) continue;
    for (const name of listed.replace(/^shrimpy /, "").replace(/ \.\.\.$/, "").split(", ")) {
      names.add(name.split(" ")[0] ?? "");
    }
  }
  return names;
}

/** The groups of the programs that `up` runs. The front page leaves them out, and their own help lists them. */
const PROGRAMS = ["gateway", "chat"];

test("every command is reached from the front page: it is on it, or its group is, and the group's help lists it", async (t) => {
  const folder = useShrimpyDir(t);
  const commands = await loadAll();

  const front = await run("--help");
  const bare = await run();

  assert.equal(front.code, 0);
  assert.equal(front.err, "");
  assert.equal(bare.code, 2, "with no command, away from a terminal, it prints the front page and exits with 2");
  assert.equal(bare.err, front.out);
  assert.ok(front.out.includes(folder), "and the page says where the Shrimpy folder is");
  assert.ok(front.out.split("\n").length <= 25, "and stays a page that is read at a glance");

  const named = namesOn(front.out);
  for (const command of commands) {
    const [group = ""] = command.name.split(" ");
    const program = PROGRAMS.includes(group);
    assert.equal(named.has(group), !program, `${command.name}: ${group} is ${program ? "left off" : "on"} the front page`);
    if (!commands.some((each) => each.name.startsWith(`${group} `))) continue;
    // A command in a group is found in the group's help, which is the help of the group's name.
    const help = await run(group, "--help");
    assert.equal(help.code, 0, group);
    assert.match(help.out, new RegExp(`^  ${command.name}( |$)`, "m"), `${command.name} is in the help of ${group}`);
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

test("a command that does not exist is refused with 2 and one message that names where to find the ones that do, also for a name that is only a property of plain objects", async () => {
  const cases: [string[], string][] = [
    [["nope"], "shrimpy --help"],
    [["constructor"], "shrimpy --help"],
    [["agent", "nope"], "shrimpy agent --help"],
    [["agent"], "shrimpy agent --help"],
  ];
  for (const [args, finder] of cases) {
    const result = await run(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.equal(result.out, "");
    assert.ok(result.err.includes(args.join(" ")) && result.err.includes(finder), result.err);
    assert.equal(result.err.split("\n").length, 1, "and the list of commands is not printed after it");
  }
});

test("a command used wrongly exits with 2 and shows its usage", async () => {
  const cases: [string[], string][] = [
    [["agent", "init"], "Missing <agent>."],
    [["agent", "init", "scout", "--model", "qwen"], 'Model "qwen" should be provider/id'],
    [["agent", "serve", "h", "--fast"], "Unknown option '--fast'"],
    [["sessions", "steer", "th_1", "one", "two"], "Unexpected argument: two."],
    [["run", "scout", "   "], "The text is empty."],
  ];
  for (const [args, expected] of cases) {
    const result = await run(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.ok(result.err.includes(expected), `${args.join(" ")} -> ${result.err}`);
    assert.match(result.err, /\nUsage: shrimpy [a-z]+/);
  }
});
