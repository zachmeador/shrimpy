import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall, type Message, type ToolResultMessage } from "@earendil-works/pi-ai";
import { eventually, stopAfter, tempDir, waitForView } from "../../lib/testing/index.ts";
import { assistantItems, callingTools, startAgentRig } from "../testing/index.ts";

const timeout = 40_000;

function textOf(message: Message | undefined): string {
  if (message?.role !== "user") return "";
  return typeof message.content === "string"
    ? message.content
    : message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

function resultText(messages: readonly Message[]): string {
  const last = messages.at(-1);
  if (last?.role !== "toolResult") return "";
  return (last as ToolResultMessage).content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

test("background bash wakes its thread on exit with a process wake line and output tail", { timeout }, async (t) => {
  const told: string[] = [];
  const model = callingTools(
    [[{ name: "bash", args: { command: "echo starting; sleep 0.5; echo finished-ok", background: true } }]],
    "Started in background.",
  );
  const rig = await startAgentRig(t, {
    tokensPerSecond: 1_000_000,
    script: (messages, home) => {
      const user = textOf(messages.findLast((m) => m.role === "user"));
      if (user.includes("exited with code 0")) {
        told.push(user);
        return fauxAssistantMessage("Background command finished cleanly.");
      }
      return model.script(messages, home);
    },
  });

  await rig.receiptOn(await rig.say("download thing"));
  const first = model.answers[0];
  assert.ok(first);
  assert.equal(first.isError, false);
  assert.match(first.text, /proc_/);

  // Process exit posts a `process` wake line and wakes the session.
  const wake = await eventually(
    async () => (await rig.said()).find((m) => m.wake?.kind === "process" && m.wake.state === "exited"),
    (found) => found !== undefined,
    { what: "the process exit wake line" },
  );
  assert.ok(wake?.wake?.kind === "process");
  assert.equal(wake.wake.code, 0);
  assert.ok(wake.wake.output?.includes("finished-ok"), String(wake.wake.output));

  await eventually(
    async () => (await rig.replies()).some((m) => m.text.includes("Background command finished cleanly.")),
    (done) => done,
    { what: "the follow-up reply after exit" },
  );
  assert.ok(told[0]?.includes("finished-ok"), told[0] ?? "");
});

test("a normal bash call gets no input, so a command reading it ends at once, and one still running after syncWaitMs moves to the background", { timeout }, async (t) => {
  let procId = "";
  let catResult = "";
  let inputResult = "";
  const rig = await startAgentRig(t, {
    syncWaitMs: 300,
    tokensPerSecond: 1_000_000,
    script: (messages) => {
      const user = textOf(messages.findLast((m) => m.role === "user"));
      const lastTool = resultText(messages);
      const call = (name: string, args: Parameters<typeof fauxToolCall>[1]) =>
        fauxAssistantMessage([fauxToolCall(name, args, { id: `call-${name}` })], { stopReason: "toolUse" });
      if (user.includes("read nothing")) {
        if (lastTool === "") return call("bash", { command: "cat; echo cat-done" });
        catResult = lastTool;
        return fauxAssistantMessage("Done.");
      }
      if (user.includes("run long")) {
        if (lastTool === "") return call("bash", { command: "echo ready; sleep 30" });
        procId = /proc_[0-9a-z]+/.exec(lastTool)?.[0] ?? "";
        return fauxAssistantMessage(`Auto-backgrounded as ${procId}.`);
      }
      if (user.includes("send input")) {
        if (lastTool === "") return call("process", { action: "input", id: procId, text: "hello\n" });
        inputResult = lastTool;
        return fauxAssistantMessage("Tried.");
      }
      if (user.includes("read output")) {
        if (lastTool === "") return call("process", { action: "read", id: procId });
        return fauxAssistantMessage(`Output: ${lastTool}`);
      }
      if (user.includes("stop it")) {
        if (lastTool === "") return call("process", { action: "kill", id: procId });
        return fauxAssistantMessage("Killed.");
      }
      return fauxAssistantMessage("Ok.");
    },
  });
  const connection = await rig.connect();

  await rig.receiptOn(await rig.say("read nothing"));
  assert.ok(catResult.includes("cat-done") && !catResult.includes("proc_"), catResult);

  await rig.receiptOn(await rig.say("run long"));
  assert.ok(procId.startsWith("proc_"), `expected auto-backgrounded proc ID, got: ${procId}`);
  const listed = await connection.processes();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, procId);
  assert.ok((await connection.processOutput(procId)).output.includes("ready"));

  await rig.receiptOn(await rig.say("send input"));
  assert.match(inputResult, /background: true/);

  await rig.receiptOn(await rig.say("read output"));
  assert.ok((await rig.replies()).at(-1)?.text.includes("ready"));

  await rig.receiptOn(await rig.say("stop it"));
  await eventually(() => connection.processes(), (procs) => procs.length === 0, { what: "killed process to disappear" });
});

test("a background command takes input, and eof lets one that reads to the end finish", { timeout }, async (t) => {
  let procId = "";
  const rig = await startAgentRig(t, {
    tokensPerSecond: 1_000_000,
    script: (messages) => {
      const user = textOf(messages.findLast((m) => m.role === "user"));
      const lastTool = resultText(messages);
      const call = (name: string, args: Parameters<typeof fauxToolCall>[1]) =>
        fauxAssistantMessage([fauxToolCall(name, args, { id: `call-${name}` })], { stopReason: "toolUse" });
      if (user.includes("exited with code 0")) return fauxAssistantMessage("It finished.");
      if (user.includes("start reader")) {
        if (lastTool === "") {
          return call("bash", { command: 'while read line; do echo "got:$line"; done; echo eof-seen', background: true });
        }
        procId = /proc_[0-9a-z]+/.exec(lastTool)?.[0] ?? "";
        return fauxAssistantMessage(`Started ${procId}.`);
      }
      if (user.includes("send input")) {
        if (lastTool === "") return call("process", { action: "input", id: procId, text: "hello-stdin\n" });
        return fauxAssistantMessage("Sent.");
      }
      if (user.includes("close input")) {
        if (lastTool === "") return call("process", { action: "input", id: procId, eof: true });
        return fauxAssistantMessage("Closed.");
      }
      return fauxAssistantMessage("Ok.");
    },
  });
  const connection = await rig.connect();

  await rig.receiptOn(await rig.say("start reader"));
  assert.ok(procId.startsWith("proc_"), procId);

  await rig.receiptOn(await rig.say("send input"));
  await eventually(
    async () => (await connection.processOutput(procId)).output,
    (out) => out.includes("got:hello-stdin"),
    { what: "stdin echo to appear in processOutput" },
  );
  assert.equal((await connection.processes()).length, 1, "input alone leaves it running");

  await rig.receiptOn(await rig.say("close input"));
  const wake = await eventually(
    async () => (await rig.said()).find((m) => m.wake?.kind === "process" && m.wake.state === "exited"),
    (found) => found !== undefined,
    { what: "the exit wake line after eof" },
  );
  assert.ok(wake?.wake?.kind === "process");
  assert.equal(wake.wake.code, 0);
  assert.ok(wake.wake.output?.includes("eof-seen"), String(wake.wake.output));
});

test("built-in check-in wakes the thread once while running, and /stop leaves background processes untouched", { timeout }, async (t) => {
  const rig = await startAgentRig(t, {
    checkinMs: 400,
    tokensPerSecond: 40,
    script: (messages) => {
      const user = textOf(messages.findLast((m) => m.role === "user"));
      const lastTool = resultText(messages);
      if (user.includes("start sleeper")) {
        if (lastTool === "") {
          return fauxAssistantMessage(
            [fauxToolCall("bash", { command: "echo $$ > bg.pid; echo alive; sleep 60", background: true }, { id: "c-bg" })],
            { stopReason: "toolUse" },
          );
        }
        return fauxAssistantMessage("Running sleeper.");
      }
      if (user.includes("stream now")) {
        return fauxAssistantMessage(Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"));
      }
      return fauxAssistantMessage("Noted.");
    },
  });
  stopAfter(t, () => {
    const pidFile = join(rig.home, "bg.pid");
    if (existsSync(pidFile)) {
      try {
        process.kill(-Number(readFileSync(pidFile, "utf8").trim()), "SIGKILL");
      } catch {
        // Already dead.
      }
    }
  });
  const connection = await rig.connect();

  await rig.receiptOn(await rig.say("start sleeper"));
  const procs = await eventually(() => connection.processes(), (list) => list.length === 1, { what: "background process to list" });
  const proc = procs[0]!;

  // Built-in check-in fires once.
  await eventually(
    async () => (await rig.said()).some((m) => m.wake?.kind === "process" && m.wake.state === "checkin" && m.wake.id === proc.id),
    (seen) => seen,
    { what: "the check-in wake line" },
  );

  // Stopping a running turn via /stop does NOT kill the background process.
  await rig.say("stream now");
  const { session } = await rig.attach();
  await waitForView(session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 10);
  await session.stop();
  assert.equal((await connection.processes()).length, 1, "/stop leaves background process running");

  // Killing from Agent.killProcess posts a `killed` wake line and wakes the session.
  await connection.killProcess(proc.id);
  await eventually(() => connection.processes(), (list) => list.length === 0, { what: "process to be removed after killProcess" });
  await eventually(
    async () => (await rig.said()).some((m) => m.wake?.kind === "process" && m.wake.state === "killed" && m.wake.id === proc.id),
    (seen) => seen,
    { what: "killed wake line after Agent.killProcess" },
  );
});

test("restarting an agent after a background process died wakes the owning thread once with interrupted", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const first = await startAgentRig(t, {
    home,
    tokensPerSecond: 1_000_000,
    script: callingTools([[{ name: "bash", args: { command: "echo $$ > bg.pid; echo before-crash; sleep 60", background: true } }]], "Started.").script,
  });
  const conn = await first.connect();
  await first.receiptOn(await first.say("start bg"));
  const [proc] = await eventually(() => conn.processes(), (list) => list.length === 1, { what: "bg process to persist" });
  assert.ok(proc);
  await eventually(() => existsSync(join(home, "bg.pid")), (ok) => ok, { what: "pid file" });
  const pid = Number(readFileSync(join(home, "bg.pid"), "utf8").trim());

  // Close agent cleanly, then kill the orphaned background process before restart.
  await first.agent.close({ now: true });
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Already dead.
  }

  const second = await startAgentRig(t, {
    home,
    chat: first.chat,
    tokensPerSecond: 1_000_000,
    script: () => fauxAssistantMessage("Saw the interruption."),
  });
  const conn2 = await second.connect();
  await eventually(
    async () => (await second.said()).some((m) => m.wake?.kind === "process" && m.wake.state === "interrupted" && m.wake.id === proc.id),
    (seen) => seen,
    { what: "interrupted wake line after restart" },
  );
  assert.equal((await conn2.processes()).length, 0);
});
