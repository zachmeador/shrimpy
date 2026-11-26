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

test("sync bash auto-backgrounds when it exceeds syncWaitMs, supports process read/input/kill and Agent.processOutput", { timeout }, async (t) => {
  let procId = "";
  const rig = await startAgentRig(t, {
    syncWaitMs: 300,
    tokensPerSecond: 1_000_000,
    script: (messages) => {
      const user = textOf(messages.findLast((m) => m.role === "user"));
      const lastTool = resultText(messages);
      if (user.includes("run long")) {
        if (lastTool === "") {
          return fauxAssistantMessage(
            [fauxToolCall("bash", { command: 'echo ready; read line; echo "got:$line"; sleep 30' }, { id: "c1" })],
            { stopReason: "toolUse" },
          );
        }
        const match = /proc_[0-9a-z]+/.exec(lastTool);
        if (match) procId = match[0];
        return fauxAssistantMessage(`Auto-backgrounded as ${procId}.`);
      }
      if (user.includes("send input")) {
        if (lastTool === "") {
          return fauxAssistantMessage(
            [fauxToolCall("process", { action: "input", id: procId, text: "hello-stdin\n" }, { id: "c2" })],
            { stopReason: "toolUse" },
          );
        }
        return fauxAssistantMessage("Sent input.");
      }
      if (user.includes("read output")) {
        if (lastTool === "") {
          return fauxAssistantMessage(
            [fauxToolCall("process", { action: "read", id: procId }, { id: "c3" })],
            { stopReason: "toolUse" },
          );
        }
        return fauxAssistantMessage(`Output: ${lastTool}`);
      }
      if (user.includes("stop it")) {
        if (lastTool === "") {
          return fauxAssistantMessage(
            [fauxToolCall("process", { action: "kill", id: procId }, { id: "c4" })],
            { stopReason: "toolUse" },
          );
        }
        return fauxAssistantMessage("Killed.");
      }
      return fauxAssistantMessage("Ok.");
    },
  });
  const connection = await rig.connect();

  await rig.receiptOn(await rig.say("run long"));
  assert.ok(procId.startsWith("proc_"), `expected auto-backgrounded proc ID, got: ${procId}`);
  const listed = await connection.processes();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.id, procId);

  await rig.receiptOn(await rig.say("send input"));
  await eventually(
    async () => (await connection.processOutput(procId)).output,
    (out) => out.includes("got:hello-stdin"),
    { what: "stdin echo to appear in processOutput" },
  );

  await rig.receiptOn(await rig.say("read output"));
  assert.ok((await rig.replies()).at(-1)?.text.includes("got:hello-stdin"));

  await rig.receiptOn(await rig.say("stop it"));
  await eventually(() => connection.processes(), (procs) => procs.length === 0, { what: "killed process to disappear" });
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
