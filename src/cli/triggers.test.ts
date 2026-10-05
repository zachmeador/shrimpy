import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { parseTrigger } from "../agent/index.ts";
import { AGENT_HOME_VARIABLE, type AgentConnection } from "../contracts/agent/index.ts";
import { attachLocal, saveMembership } from "../contracts/agent/node.ts";
import { joinRoster, memberNamed } from "../contracts/chat/testing/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { eventually, stopAfter, useRuntimeDir } from "../lib/testing/index.ts";
import { localTime } from "../lib/time/index.ts";
import { runCli } from "./index.ts";
import {
  captureIo,
  declareLocalModel,
  type ServedAgent,
  serve,
  shrimpy,
  startModelServer,
  startTalking,
  useShrimpyDir,
} from "./testing/index.ts";

/*
 * These tests make and change triggers with the commands, as people and agents
 * do. The agent is a process of its own, serving a home in the test's Shrimpy
 * folder, and its model is a stand-in on a local port.
 */

const timeout = 90_000;

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out.join("\n"), err: cli.err.join("\n") };
}

/** The agent `scout`, made in the test's Shrimpy folder and serving, and its home. */
async function servedScout(t: TestContext): Promise<{ home: string; agent: ServedAgent; connection: () => Promise<AgentConnection> }> {
  useRuntimeDir(t);
  const model = await startModelServer();
  t.after(() => model.close());
  assert.equal((await run("agent", "init", "scout", "--model", "local/test-model")).code, 0);
  const home = join(useShrimpyDir(t), "agents", "scout");
  declareLocalModel(home, { url: model.url, model: "test-model" });
  const agent = await serve(t, home);
  const connection = async (): Promise<AgentConnection> => {
    const attached = await attachLocal(home);
    stopAfter(t, () => attached.close().catch(() => undefined));
    return attached;
  };
  return { home, agent, connection };
}

test("add writes a file the agent's own check accepts, a running agent picks it up at once, and the command says when it first runs", { timeout }, async (t) => {
  const { home, connection } = await servedScout(t);

  const added = await run("triggers", "add", "nightly", "--every", "1h", "Tidy the notes.", "--agent", "scout");

  assert.equal(added.code, 0, added.err);
  const file = join(home, "triggers", "nightly.md");
  assert.deepEqual(parseTrigger("nightly", readFileSync(file, "utf8")), {
    name: "nightly",
    schedule: { every: "1h" },
    thread: null,
    enabled: true,
    overlap: "skip",
    prompt: "Tidy the notes.",
  });
  const [trigger] = await (await connection()).triggers();
  assert.equal(trigger?.name, "nightly", "the agent has it without being restarted");
  assert.ok(trigger.next !== null && Math.abs(trigger.next - Date.now() - 3_600_000) < 60_000);
  assert.ok(added.out.includes(`first runs at ${localTime(trigger.next)}`), `the time the agent has is said:\n${added.out}`);

  // Making it again replaces it, and a schedule that changes counts from then.
  const replaced = await run("triggers", "add", "nightly", "--cron", "0 3 * * *", "--timezone", "Europe/Berlin", "Tidy more.", "--agent", "scout");
  assert.equal(replaced.code, 0, replaced.err);
  assert.ok(/Replaced/.test(replaced.out), replaced.out);
  const [again] = await (await connection()).triggers();
  assert.deepEqual(again?.schedule, { cron: "0 3 * * *", timezone: "Europe/Berlin" });
  assert.ok(replaced.out.includes(`runs at ${localTime(again.next ?? 0)}`), replaced.out);
  const listed = await run("triggers", "--agent", "scout");
  assert.equal(listed.code, 0, listed.err);
  assert.ok(listed.out.includes("nightly") && listed.out.includes("on"), listed.out);

  // A check comes with what counts as news and how long it may run, and the agent has it as the file says it.
  const checked = await run("triggers", "add", "inbox", "--every", "1h", "--check", 'ls inbox | grep -c "new"', "--when", "output", "--timeout", "30s", "Tell me.", "--agent", "scout");
  assert.equal(checked.code, 0, checked.err);
  const check = { command: 'ls inbox | grep -c "new"', when: "output", then: "wake", timeout: "30s" };
  assert.deepEqual(parseTrigger("inbox", readFileSync(join(home, "triggers", "inbox.md"), "utf8")).check, check);
  assert.deepEqual((await (await connection()).trigger("inbox")).check, check);
  const shown = await run("triggers", "show", "inbox", "--agent", "scout");
  assert.ok(shown.out.includes(check.command) && shown.out.includes("30s"), shown.out);
});

test("a schedule that is wrong is refused with the key and the value, and nothing is written", { timeout }, async (t) => {
  assert.equal((await run("agent", "init", "scout", "--model", "local/test-model")).code, 0);
  const home = join(useShrimpyDir(t), "agents", "scout");

  const refused: [string, string[], string][] = [
    ["a delay that is not one", ["--every", "soon"], "every: soon"],
    ["a delay under a minute", ["--every", "30s"], "every: 30s"],
    ["a cron without five fields", ["--cron", "0 3 * *"], "cron: 0 3 * *"],
    ["a cron that never comes", ["--cron", "0 0 30 2 *", "--timezone", "UTC"], "cron: 0 0 30 2 *"],
    ["a time zone that is not one", ["--cron", "0 3 * * *", "--timezone", "Mars/Olympus"], "timezone: Mars/Olympus"],
    ["a time zone with a delay", ["--every", "1h", "--timezone", "UTC"], "timezone"],
    ["a thread that is not an ID", ["--every", "1h", "--thread", "general"], "thread: general"],
    ["an overlap that is not one", ["--every", "1h", "--overlap", "always"], "overlap: always"],
    ["a when with no check", ["--every", "1h", "--when", "output"], "when goes with check"],
    ["a when that is not one", ["--every", "1h", "--check", "true", "--when", "sometimes"], "when: sometimes"],
    ["a then that is not built yet", ["--every", "1h", "--check", "true", "--then", "note"], "then: note"],
    ["a timeout that is not a delay", ["--every", "1h", "--check", "true", "--timeout", "soon"], "timeout: soon"],
    ["a timeout that is too long", ["--every", "1h", "--check", "true", "--timeout", "20m"], "timeout: 20m"],
    ["a check of more than one line", ["--every", "1h", "--check", "true\nfalse"], "check is one line"],
  ];
  for (const [what, flags, mentions] of refused) {
    const result = await run("triggers", "add", "nightly", ...flags, "Tidy.", "--agent", "scout");
    assert.equal(result.code, 2, `${what}: ${result.err}`);
    assert.ok(result.err.includes(mentions), `${what}: ${result.err}`);
  }
  const named = await run("triggers", "add", "two words", "--every", "1h", "Tidy.", "--agent", "scout");
  assert.equal(named.code, 2);
  assert.ok(named.err.includes("two words"), named.err);

  // A command used without saying when, or twice over, or without a prompt, is told so.
  assert.equal((await run("triggers", "add", "nightly", "Tidy.", "--agent", "scout")).code, 2);
  assert.equal((await run("triggers", "add", "nightly", "--every", "1h", "--cron", "0 3 * * *", "Tidy.", "--agent", "scout")).code, 2);
  assert.equal((await run("triggers", "add", "nightly", "--every", "1h", "--agent", "scout")).code, 2);
  assert.equal((await run("triggers", "add", "nightly", "--every", "1h", " ", "--agent", "scout")).code, 2);

  assert.deepEqual(existsSync(join(home, "triggers")) ? readdirSync(join(home, "triggers")) : [], [], "no file was written");
});

test("off, on and remove change the trigger's file and tell a running agent, and with no agent running they say the change waits for the start", { timeout }, async (t) => {
  const { home, agent, connection } = await servedScout(t);
  assert.equal((await run("triggers", "add", "nightly", "--every", "1h", "Tidy.", "--agent", "scout")).code, 0);
  const file = join(home, "triggers", "nightly.md");
  const state = async () => {
    const [trigger] = await (await connection()).triggers();
    return [trigger?.on, trigger?.next === null];
  };

  const off = await run("triggers", "off", "nightly", "--agent", "scout");
  assert.equal(off.code, 0, off.err);
  assert.equal(parseTrigger("nightly", readFileSync(file, "utf8")).enabled, false);
  assert.deepEqual(await state(), [false, true], "the running agent stopped it");
  assert.match((await run("triggers", "off", "nightly", "--agent", "scout")).out, /already/);
  const on = await run("triggers", "on", "nightly", "--agent", "scout");
  assert.equal(on.code, 0, on.err);
  assert.deepEqual(await state(), [true, false], "and the running agent has it going again");
  assert.equal(parseTrigger("nightly", readFileSync(file, "utf8")).prompt, "Tidy.", "the rest of the file is as it was");

  // With the agent stopped there is nobody to tell. The file changes, and the agent reads it when it starts.
  assert.equal((await agent.stop()).code, 0);
  const stopped = await run("triggers", "off", "nightly", "--agent", "scout");
  assert.equal(stopped.code, 0, stopped.err);
  assert.match(stopped.out, /when the agent starts/);
  assert.equal(parseTrigger("nightly", readFileSync(file, "utf8")).enabled, false);
  const unasked = await run("triggers", "--agent", "scout");
  assert.equal(unasked.code, 1, "it can't say when a trigger runs next");
  assert.match(unasked.err, /agent serve scout/);
  assert.ok(unasked.out.includes("nightly") && unasked.out.includes("off"), "but it says what the files say");
  const refused = await run("triggers", "run", "nightly", "--agent", "scout");
  assert.equal(refused.code, 1);
  assert.match(refused.err, /agent serve scout/);

  const removed = await run("triggers", "remove", "nightly", "--agent", "scout");
  assert.equal(removed.code, 0, removed.err);
  assert.equal(existsSync(file), false);
  const missing = await run("triggers", "remove", "nightly", "--agent", "scout");
  assert.equal(missing.code, 1);
  assert.match(missing.err, /no trigger called nightly/);

  // A trigger made with nobody to tell waits for the start, and counts from then.
  const later = await run("triggers", "add", "later", "--every", "2h", "Tidy later.", "--agent", "scout");
  assert.equal(later.code, 0, later.err);
  assert.match(later.out, /when the agent starts, and the trigger first runs 2h after that/);

  const restarted = await serve(t, home);
  const [only] = await (await connection()).triggers();
  assert.equal(only?.name, "later", "the agent that starts again has the one trigger the files hold");
  assert.ok(only.next !== null && Math.abs(only.next - Date.now() - 7_200_000) < 60_000, "and it first runs when the command said");
  assert.equal((await restarted.stop()).code, 0);
});

test("run fires a trigger now even when it is off, and show lists the occurrence with how it ended", { timeout }, async (t) => {
  const { connection } = await servedScout(t);
  assert.equal((await run("triggers", "add", "parked", "--every", "1h", "Tidy the notes.", "--agent", "scout")).code, 0);
  assert.equal((await run("triggers", "off", "parked", "--agent", "scout")).code, 0);

  const fired = await run("triggers", "run", "parked", "--agent", "scout");

  assert.equal(fired.code, 0, fired.err);
  const shown = await eventually(
    () => run("triggers", "show", "parked", "--agent", "scout"),
    (result) => result.out.includes("by hand") && result.out.includes("answered"),
    { what: "the occurrence to be answered", timeoutMs: 30_000 },
  );
  assert.equal(shown.code, 0, shown.err);
  assert.ok(shown.out.includes("Tidy the notes.") && shown.out.includes("1h"), "its definition is there too");
  const [trigger] = await (await connection()).triggers();
  assert.deepEqual([trigger?.on, trigger?.last?.byHand, trigger?.last?.ended], [false, true, "answered"]);

  const nothing = await run("triggers", "run", "nothing", "--agent", "scout");
  assert.equal(nothing.code, 1);
  assert.ok(nothing.err.includes("parked"), "and an unknown name is answered with the triggers there are");
  assert.equal((await run("triggers", "show", "nothing", "--agent", "scout")).code, 1);
});

test("in an agent's shell the commands act on that agent, and in a person's terminal they need --agent when the folder has more than one", { timeout }, async (t) => {
  const { home } = await servedScout(t);
  assert.equal((await run("agent", "init", "rex", "--model", "local/test-model")).code, 0);
  // The launcher in an agent's home sets this for its shell; a test that runs in one must not take it for its own.
  const inShell = { env: { [AGENT_HOME_VARIABLE]: home } };
  const elsewhere = { env: { [AGENT_HOME_VARIABLE]: "" } };
  const enabled = (): boolean => parseTrigger("nightly", readFileSync(join(home, "triggers", "nightly.md"), "utf8")).enabled;

  const added = await shrimpy(["triggers", "add", "nightly", "--every", "1h", "Tidy."], inShell);
  assert.equal(added.code, 0, added.stderr);
  const listed = await shrimpy(["triggers"], inShell);
  assert.equal(listed.code, 0, listed.stderr);
  assert.ok(listed.stdout.includes("nightly"), listed.stdout);

  const unaimed = await shrimpy(["triggers"], elsewhere);
  assert.equal(unaimed.code, 2);
  assert.ok(unaimed.stderr.includes("--agent") && unaimed.stderr.includes("scout"), `it says what to give, and which agents there are:\n${unaimed.stderr}`);
  assert.equal((await shrimpy(["triggers", "off", "nightly"], elsewhere)).code, 2);
  assert.equal(enabled(), true, "a change to nobody's triggers is not made");
  const named = await shrimpy(["triggers", "--agent", "scout"], elsewhere);
  assert.equal(named.code, 0, named.stderr);
  assert.ok(named.stdout.includes("nightly"));

  assert.equal((await shrimpy(["triggers", "off", "nightly"], inShell)).code, 0);
  assert.equal(enabled(), false);
});

test("add with a thread, run in the agent's shell, asks chat as the agent whether the thread is one it is in, and writes nothing for one it is not", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const you = await talking.you();
  assert.equal((await run("agent", "init", "scout", "--model", "local/test-model")).code, 0);
  const home = join(useShrimpyDir(t), "agents", "scout");
  // The agent has joined the roster with a token its home keeps, which is what a command in its shell signs in with.
  const token = newToken();
  await (await talking.gateway.connect()).join("scout", token);
  saveMembership(home, { token });
  const scout = await memberNamed(t, "scout");
  const maya = await joinRoster(t, "maya");
  const [mine] = await you.chat.threads((await you.chat.openDm(scout.id)).id);
  const [theirs] = await you.chat.threads((await you.chat.openDm(maya.id)).id);
  assert.ok(mine && theirs, "the person can see both threads, and only one is the agent's");
  const inShell = { env: { [AGENT_HOME_VARIABLE]: home } };
  const file = join(home, "triggers", "report.md");

  const refused = await shrimpy(["triggers", "add", "report", "--every", "1h", "--thread", theirs.id, "Write the report."], inShell);
  assert.equal(refused.code, 2, refused.stderr);
  assert.ok(refused.stderr.includes(theirs.id), refused.stderr);
  assert.equal(existsSync(file), false, "nothing was written");

  const accepted = await shrimpy(["triggers", "add", "report", "--every", "1h", "--thread", mine.id, "Write the report."], inShell);
  assert.equal(accepted.code, 0, accepted.stderr);
  assert.ok(!accepted.stdout.includes("not checked"), accepted.stdout);
  assert.equal(parseTrigger("report", readFileSync(file, "utf8")).thread, mine.id);

  // Anyone else can't ask chat as the agent, so the thread is not checked, and the trigger is written all the same.
  const elsewhere = { env: { [AGENT_HOME_VARIABLE]: "" } };
  const unchecked = await shrimpy(["triggers", "add", "other", "--every", "1h", "--thread", theirs.id, "Write it.", "--agent", "scout"], elsewhere);
  assert.equal(unchecked.code, 0, unchecked.stderr);
  assert.ok(unchecked.stdout.includes("not checked"), unchecked.stdout);
  assert.equal(parseTrigger("other", readFileSync(join(home, "triggers", "other.md"), "utf8")).thread, theirs.id);
});
