import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember } from "../../../contracts/chat/index.ts";
import { assistantItem, sessionView, toolItem, userItem, workingView } from "../../../contracts/agent/testing/index.ts";
import {
  aChatServer,
  aDm,
  aMessage,
  aModel,
  anAgent,
  aReceipt,
  aThread,
  aThreadView,
  onThread,
  zach,
} from "../state/testing/index.ts";
import { type AgentsScreen, farewellLine, type Screen, screenOf, type ThreadScreen, type ThreadsScreen } from "./index.ts";

const at = (month: number, day: number, hour: number, minute: number, year = 2026): number =>
  new Date(year, month - 1, day, hour, minute).getTime();
const now = at(10, 3, 15, 0);

const scout = agentMember("scout");

const agents = (screen: Screen): AgentsScreen => {
  assert.equal(screen.kind, "agents");
  return screen as AgentsScreen;
};
const threads = (screen: Screen): ThreadsScreen => {
  assert.equal(screen.kind, "threads");
  return screen as ThreadsScreen;
};
const thread = (screen: Screen): ThreadScreen => {
  assert.equal(screen.kind, "thread");
  return screen as ThreadScreen;
};

test("the agents are listed by name, with whether each is working, and the list says nothing is wrong when nothing is", () => {
  const busy = aThread("th_1", { working: [{ memberId: scout.id, since: 0 }] });
  const model = aModel({
    listing: { programs: [anAgent("scout"), anAgent("mechanic"), aChatServer()], version: "0.0.0" },
    dms: { scout: aDm("scout", [busy]) },
  });

  const screen = agents(screenOf(model, { now }));

  assert.deepEqual(
    screen.rows.map((row) => [row.id, row.label, row.detail, row.working]),
    [
      ["mechanic", "mechanic", "idle", false],
      ["scout", "scout", "working", true],
    ],
  );
  assert.equal(screen.title, "Agents");
  assert.equal(screen.stale, false);
  assert.equal(screen.empty, undefined);
  assert.deepEqual(screen.notes, []);
});

test("with no agents it says what to start, and with no gateway it says that instead", () => {
  const none = agents(screenOf(aModel(), { now }));
  assert.equal(
    none.empty,
    "No agent is registered with this machine's gateway. Start one with: shrimpy agent serve <home>, or start everything with: shrimpy up <home>... --data <dir>",
  );

  const away = agents(
    screenOf(aModel({ gateway: { state: "down", why: { kind: "not-running" } }, listing: undefined, chat: { state: "down", why: { kind: "not-registered" } } }), { now }),
  );
  assert.equal(away.empty, undefined);
  assert.deepEqual(away.notes, [
    { tone: "warn", text: "No gateway is running on this machine. Start Shrimpy with: shrimpy up <home>... --data <dir>" },
  ]);
});

test("when the gateway is lost the list stays, marked as possibly out of date, and says what was lost", () => {
  const model = aModel({
    gateway: { state: "down", why: { kind: "lost" } },
    listing: { programs: [anAgent("scout")], version: "0.0.0" },
  });

  const screen = agents(screenOf(model, { now }));

  assert.equal(screen.stale, true);
  assert.deepEqual(screen.rows.map((row) => row.id), ["scout"]);
  assert.deepEqual(screen.notes, [
    { tone: "warn", text: "Lost the connection to the gateway. The list of agents may be out of date. Trying again." },
  ]);
});

test("an agent's threads show their names or first messages, when they were last active, and whether the agent is working", () => {
  const model = aModel({
    where: { screen: "threads", agent: "scout" },
    dms: {
      scout: aDm("scout", [
        aThread("th_a", { preview: "Check the disk usage", updatedAt: at(10, 3, 14, 5), working: [{ memberId: scout.id, since: 0 }] }),
        aThread("th_b", { name: "Dentist", preview: "ignored", updatedAt: at(9, 30, 9, 5) }),
        aThread("th_c", { updatedAt: at(12, 31, 23, 59, 2025), main: true }),
        aThread("th_d", { preview: "Old plans", updatedAt: at(1, 1, 8, 0), archived: true }),
      ]),
    },
  });

  const screen = threads(screenOf(model, { now }));

  assert.equal(screen.title, "scout · your threads");
  assert.deepEqual(
    screen.rows.map((row) => [row.id, row.label, row.detail, row.working]),
    [
      ["th_a", "Check the disk usage", "14:05 · working", true],
      ["th_b", "Dentist", "Sep 30 09:05", false],
      ["th_c", "(no messages yet) [main]", "2025-12-31 23:59", false],
      ["th_d", "Old plans [archived]", "Jan 1 08:00", false],
    ],
  );
  assert.equal(screen.empty, undefined);
});

test("an agent the person has not talked to has no threads, and says how to start one", () => {
  const model = aModel({ where: { screen: "threads", agent: "scout" }, listing: { programs: [anAgent("scout")], version: "0.0.0" } });

  const screen = threads(screenOf(model, { now }));

  assert.deepEqual(screen.rows, []);
  assert.equal(screen.empty, "You have not talked to scout yet. Press n to start a thread.");
  assert.match(screen.keys, /n new thread/);
});

test("when chat is lost the threads stay and say so, and nothing claims there are none", () => {
  const model = aModel({
    where: { screen: "threads", agent: "scout" },
    chat: { state: "down", why: { kind: "lost" } },
    dms: { scout: aDm("scout", [aThread("th_a", { preview: "Hello" })]) },
  });

  const screen = threads(screenOf(model, { now }));

  assert.equal(screen.stale, true);
  assert.equal(screen.rows.length, 1);
  assert.deepEqual(screen.notes.map((note) => note.text), [
    "Lost the connection to the chat server. What is shown may be out of date, and nothing can be sent. Trying again.",
  ]);
  const empty = threads(screenOf(aModel({ where: { screen: "threads", agent: "scout" }, chat: { state: "down", why: { kind: "lost" } } }), { now }));
  assert.equal(empty.empty, undefined);
});

test("a thread shows who said what and when, oldest first, as themselves or as someone else", () => {
  const open = aThread("th_1", { preview: "Hello there", updatedAt: at(10, 3, 14, 5) });
  const view = aThreadView(open, [
    aMessage("msg_1", zach, "Hello there", { sentAt: at(10, 3, 14, 5) }),
    aMessage("msg_2", scout, "Hi!\n\n- one\n- two", { sentAt: at(10, 3, 14, 6) }),
  ]);

  const screen = thread(screenOf(onThread("scout", open, view), { now }));

  assert.equal(screen.title, "scout · Hello there");
  assert.deepEqual(
    screen.messages.map((message) => [message.who, message.mine, message.agent, message.when, message.text]),
    [
      ["zach", true, false, "14:05", "Hello there"],
      ["scout", false, true, "14:06", "Hi!\n\n- one\n- two"],
    ],
  );
  assert.equal(screen.lead, undefined);
  assert.equal(screen.working, undefined);
  assert.equal(screen.work, undefined);
});

test("a message an agent failed, stopped or skipped says so, and one it answered or kept silent about says nothing", () => {
  const open = aThread("th_1", { preview: "go" });
  const view = aThreadView(open, [
    aMessage("msg_1", zach, "answered", { receipts: [aReceipt("scout", "answered")] }),
    aMessage("msg_2", zach, "silent", { receipts: [aReceipt("scout", "silent")] }),
    aMessage("msg_3", zach, "failed", { receipts: [aReceipt("scout", "failed", "The model failed:\nit was rude")] }),
    aMessage("msg_4", zach, "stopped", { receipts: [aReceipt("scout", "stopped")] }),
    aMessage("msg_5", zach, "skipped", { receipts: [aReceipt("scout", "skipped")] }),
  ]);

  const screen = thread(screenOf(onThread("scout", open, view), { now }));

  assert.deepEqual(screen.messages.map((message) => message.notes), [
    [],
    [],
    ["scout failed: The model failed: it was rude"],
    ["scout stopped before answering"],
    ["scout skipped this message"],
  ]);
});

test("a thread that is working shows who is, and the work: thinking, tools with their status and output, and the answer so far", () => {
  const open = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });
  const view = aThreadView(open, [aMessage("msg_1", zach, "go")]);
  const session = workingView(
    [
      userItem("zach wrote at 2026-10-03T14:05:00Z:\ngo"),
      assistantItem("Let me look.", { thinking: "I should list the files first.", stopReason: "toolUse" }),
      toolItem("bash", { args: { command: "ls -la" }, status: "done", output: "a\nb\n", id: "call_1" }),
      assistantItem("Two files", { streaming: true }),
    ],
    { kind: "answering" },
  );

  const screen = thread(screenOf(onThread("scout", open, view, { session }), { now }));

  assert.equal(screen.working, "scout is working · answering · esc to stop");
  assert.deepEqual(screen.work, {
    earlier: undefined,
    steps: [
      { kind: "thinking", label: "thinking", text: "I should list the files first." },
      { kind: "text", text: "Let me look.", note: undefined },
      { kind: "tool", name: "bash", call: "$ ls -la", status: "✓ done", tone: "good", output: ["a", "b"], earlier: undefined, notes: [] },
      { kind: "text", text: "Two files", note: undefined },
    ],
  });
});

test("the work is only the current turn, and nothing once the session is idle", () => {
  const open = aThread("th_1", { preview: "go" });
  const history = [
    userItem("first"),
    assistantItem("first answer"),
    userItem("second"),
    toolItem("bash", { args: { command: "date" }, status: "running" }),
  ];

  const busy = thread(screenOf(onThread("scout", open, undefined, { session: workingView(history, { kind: "tool", name: "bash" }) }), { now }));
  const idle = thread(screenOf(onThread("scout", open, undefined, { session: sessionView({ items: history }) }), { now }));

  assert.deepEqual(busy.work?.steps.map((step) => step.kind), ["tool"]);
  assert.equal(busy.working, "scout is working · running bash · esc to stop");
  assert.equal(idle.work, undefined);
  assert.equal(idle.working, undefined);
});

test("the agent working with no session to watch yet is still shown as working", () => {
  const open = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });

  const screen = thread(screenOf(onThread("scout", open, aThreadView(open, [aMessage("msg_1", zach, "go")])), { now }));

  assert.equal(screen.working, "scout is working · esc to stop");
  assert.equal(screen.work, undefined);
});

test("a turn with more steps than are shown says how many are left out", () => {
  const open = aThread("th_1", { preview: "go" });
  const items = [
    userItem("go"),
    ...Array.from({ length: 15 }, (_, index) => toolItem("bash", { id: `call_${String(index)}`, args: { command: `echo ${String(index)}` }, status: "done" })),
  ];

  const screen = thread(screenOf(onThread("scout", open, undefined, { session: workingView(items) }), { now }));

  assert.ok(screen.work);
  assert.equal(screen.work.earlier, "3 earlier steps not shown");
  assert.equal(screen.work.steps.length, 12);
  const [first] = screen.work.steps;
  assert.equal(first?.kind === "tool" && first.call, "$ echo 3");
});

test("a tool that was interrupted, failed or is waiting, and an answer that was cut off, are shown as they are", () => {
  const open = aThread("th_1", { preview: "go" });
  const items = [
    userItem("go"),
    assistantItem("Partial", { stopReason: "aborted" }),
    toolItem("write", { args: { path: "x.txt" }, status: "interrupted", notes: ["The agent restarted; the call was not run again."] }),
    toolItem("read", { args: {}, status: "pending" }),
    toolItem("grep", { status: "error", output: "no such file" }),
  ];

  const steps = thread(screenOf(onThread("scout", open, undefined, { session: workingView(items) }), { now })).work?.steps ?? [];

  assert.deepEqual(steps, [
    { kind: "text", text: "Partial", note: "answer interrupted" },
    {
      kind: "tool",
      name: "write",
      call: '{"path":"x.txt"}',
      status: "! interrupted, not run again",
      tone: "bad",
      output: [],
      earlier: undefined,
      notes: ["The agent restarted; the call was not run again."],
    },
    { kind: "tool", name: "read", call: "", status: "○ waiting", tone: "idle", output: [], earlier: undefined, notes: [] },
    { kind: "tool", name: "grep", call: "", status: "✗ failed", tone: "bad", output: ["no such file"], earlier: undefined, notes: [] },
  ]);
});

test("a tool's output shows its last lines, and says how many came before", () => {
  const open = aThread("th_1", { preview: "go" });
  const output = Array.from({ length: 10 }, (_, index) => `line ${String(index + 1)}`).join("\n");

  const screen = thread(screenOf(onThread("scout", open, undefined, { session: workingView([userItem("go"), toolItem("bash", { output })]) }), { now }));

  const [step] = screen.work?.steps ?? [];
  assert.ok(step?.kind === "tool");
  assert.deepEqual(step.output, ["line 5", "line 6", "line 7", "line 8", "line 9", "line 10"]);
  assert.equal(step.earlier, "4 earlier lines");
});

test("a thread says when older messages are not shown, when it has none, and when it has not started", () => {
  const open = aThread("th_1", { preview: "x" });
  const model = (view: ReturnType<typeof aThreadView> | undefined, started = true) =>
    onThread("scout", open, view, { where: { screen: "thread", agent: "scout", thread: started ? "th_1" : undefined } });

  assert.equal(thread(screenOf(model(aThreadView(open, [aMessage("msg_1", zach, "x")], 37)), { now })).lead, "37 earlier messages are not shown. Read them with: shrimpy read th_1");
  assert.equal(thread(screenOf(model(aThreadView(open, [aMessage("msg_1", zach, "x")], 1)), { now })).lead, "1 earlier message is not shown. Read them with: shrimpy read th_1");
  assert.equal(thread(screenOf(model(aThreadView(open, [])), { now })).lead, "No messages yet.");
  const fresh = thread(screenOf(model(undefined, false), { now }));
  assert.equal(fresh.lead, "New thread with scout. Type below to start it.");
  assert.equal(fresh.title, "scout · new thread");
  assert.equal(thread(screenOf(model(undefined), { now })).lead, undefined, "a thread that has not arrived yet says nothing");
  assert.equal(thread(screenOf(onThread("scout", aThread("th_9", {}), undefined, { where: { screen: "thread", agent: "scout", thread: "th_other" } }), { now })).title, "scout · th_other");
});

test("while chat or the agent is lost, what is shown is marked, and the notes say what was lost and what to do", () => {
  const open = aThread("th_1", { preview: "go" });
  const view = aThreadView(open, [aMessage("msg_1", zach, "go")]);
  const base = onThread("scout", open, view, { session: workingView([userItem("go")]) });

  const chatLost = thread(screenOf({ ...base, chat: { state: "down", why: { kind: "lost" } } }, { now }));
  const agentLost = thread(screenOf({ ...base, agent: { state: "down", why: { kind: "lost" } } }, { now }));

  assert.equal(chatLost.workStale, false);
  assert.equal(agentLost.workStale, true);
  assert.equal(agentLost.messages.length, 1);
  assert.notEqual(agentLost.work, undefined, "the work stays");
  assert.deepEqual(agentLost.notes.map((note) => note.text), [
    "Lost the connection to scout. The work shown may be out of date, and it can't be stopped from here. Trying again.",
  ]);
});

test("an agent that went away is not said to be working because of what its session last showed", () => {
  const working = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });
  const idle = aThread("th_1", { preview: "go" });
  const lost = { state: "down" as const, why: { kind: "lost" as const } };
  const session = workingView([userItem("go"), assistantItem("Partial", { streaming: true })]);

  const gone = thread(screenOf(onThread("scout", idle, undefined, { session, agent: lost }), { now }));
  const stillMarked = thread(screenOf(onThread("scout", working, undefined, { session, agent: lost }), { now }));

  assert.equal(gone.working, undefined);
  assert.notEqual(gone.work, undefined, "the work it showed stays, marked as out of date");
  assert.equal(gone.workStale, true);
  assert.equal(stillMarked.working, "scout is working · esc to stop", "chat still says so, so it is said, without what the session was doing");
});

test("the gateway being gone explains why nothing is registered, and is said once", () => {
  const open = aThread("th_1", { preview: "go" });
  const model = onThread("scout", open, undefined, {
    gateway: { state: "down", why: { kind: "not-running" } },
    chat: { state: "down", why: { kind: "not-registered" } },
    agent: { state: "down", why: { kind: "not-registered" } },
  });

  assert.deepEqual(thread(screenOf(model, { now })).notes.map((note) => note.text), [
    "No gateway is running on this machine. Start Shrimpy with: shrimpy up <home>... --data <dir>",
  ]);
  const up = thread(screenOf({ ...model, gateway: { state: "up" } }, { now }));
  assert.deepEqual(up.notes.map((note) => note.text), [
    "No chat server is registered with this machine's gateway. Start one with: shrimpy chat serve <data-dir>, or start everything with: shrimpy up <home>... --data <dir>",
    "No agent named scout is registered with this machine's gateway. Start it with: shrimpy agent serve <home>, or start everything with: shrimpy up <home>... --data <dir>",
  ]);
});

test("a program that could not be reached says why in the words it was given, and connecting says nothing", () => {
  const model = aModel({
    gateway: { state: "down", why: { kind: "connecting" } },
    chat: { state: "down", why: { kind: "unreachable", message: "Could not reach the chat server at /tmp/chat.sock: nope" } },
  });

  assert.deepEqual(agents(screenOf(model, { now })).notes.map((note) => note.text), [
    "Could not reach the chat server at /tmp/chat.sock: nope",
  ]);
});

test("a program that runs another version of Shrimpy is named, and the same version is not", () => {
  const model = aModel({
    where: { screen: "threads", agent: "scout" },
    listing: { programs: [anAgent("scout", "9.9.9"), aChatServer("8.8.8")], version: "7.7.7" },
  });

  assert.deepEqual(threads(screenOf(model, { now })).notes.map((note) => note.text), [
    "Warning: the gateway runs Shrimpy 7.7.7, but this console is 0.0.0. Programs are meant to be upgraded together.",
    "Warning: the chat server runs Shrimpy 8.8.8, but this console is 0.0.0. Programs are meant to be upgraded together.",
    "Warning: the agent scout runs Shrimpy 9.9.9, but this console is 0.0.0. Programs are meant to be upgraded together.",
  ]);
});

test("every notice says what happened and what to do", () => {
  const open = aThread("th_1", { preview: "go" });
  const on = (notice: NonNullable<ReturnType<typeof aModel>["notice"]>) =>
    thread(screenOf(onThread("scout", open, undefined, { notice }), { now })).notes.map((note) => [note.tone, note.text]);

  assert.deepEqual(on({ kind: "not-sent", problem: { down: { kind: "lost" } } }), [
    ["warn", "Not sent: lost the connection to the chat server. Your message is still in the editor."],
  ]);
  assert.deepEqual(on({ kind: "not-sent", problem: { said: "The disk is full." } }), [
    ["warn", "Not sent: The disk is full. Your message is still in the editor."],
  ]);
  assert.deepEqual(on({ kind: "not-sent", problem: { down: { kind: "connecting" } } }), [
    ["warn", "Not sent: not connected to the chat server yet. Your message is still in the editor."],
  ]);
  assert.deepEqual(on({ kind: "not-opened", problem: { said: "Unknown thread: th_9" } }), [["warn", "Could not open the thread: Unknown thread: th_9."]]);
  assert.deepEqual(on({ kind: "not-watched", problem: { said: "Nope" } }), [["warn", "Could not watch the work: Nope."]]);
  assert.deepEqual(on({ kind: "not-listed", problem: { down: { kind: "lost" } } }), [
    ["warn", "Could not read your threads: lost the connection to the chat server."],
  ]);
  assert.deepEqual(on({ kind: "stopped" }), [["info", "Stopped scout's work in this thread."]]);
  assert.deepEqual(on({ kind: "nothing-to-stop" }), [["warn", "Nothing to stop: scout is not working in this thread."]]);
  assert.deepEqual(on({ kind: "not-stopped", problem: { down: { kind: "not-registered" } } }), [
    ["warn", "Could not stop the work: scout is not registered with the gateway."],
  ]);
});

test("every screen names the keys that do something there", () => {
  assert.equal(agents(screenOf(aModel(), { now })).keys, "↑↓ choose · enter open · ctrl+c twice to quit");
  assert.equal(
    thread(screenOf(onThread("scout", aThread("th_1", {}), undefined), { now })).keys,
    "enter send · esc stop · ctrl+t threads · ctrl+n new · ctrl+c clear, then quit",
  );
});

test("the line for leaving names the agent and the thread, says the work continues, and says how to stop it", () => {
  assert.equal(
    farewellLine("scout", "th_4k9x2m7q0b3d"),
    "scout is still working in thread th_4k9x2m7q0b3d, and the work continues. To stop it, open the thread and press Esc, or run: shrimpy sessions stop <home> th_4k9x2m7q0b3d",
  );
  assert.equal(farewellLine("sc\u001b[2Jout", "th_\u0007x"), farewellLine("scout", "th_x"));
});

/** Every string anywhere in a value, except the IDs, which are what the state is told about a choice and are never shown. */
function* stringsIn(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const each of value) yield* stringsIn(each);
  else if (typeof value === "object" && value !== null) {
    for (const [key, each] of Object.entries(value)) if (key !== "id") yield* stringsIn(each);
  }
}

test("text from other members and from tools can't act on a terminal, wherever it appears", () => {
  const ESC = "\u001b";
  const hostile = `${ESC}]0;pwned\u0007${ESC}[2J${ESC}[31mred\u009b6n\rover`;
  const ACTED_ON = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]");
  const stranger = { id: "person:evil", kind: "person" as const, name: `Evil${hostile}` };
  const open = aThread("th_1", { name: `Name${hostile}`, preview: `Preview${hostile}`, working: [{ memberId: scout.id, since: now }] });
  const view = aThreadView(open, [
    aMessage("msg_1", stranger, `text${hostile}`, { receipts: [aReceipt("scout", "failed", `detail${hostile}`)] }),
    aMessage("msg_2", scout, `reply${hostile}`),
  ]);
  const session = workingView(
    [
      userItem("go"),
      assistantItem(`answer${hostile}`, { thinking: `thinking${hostile}`, streaming: true }),
      toolItem(`tool${hostile}`, { args: { command: `echo ${hostile}` }, output: `output${hostile}`, notes: [`note${hostile}`] }),
    ],
    { kind: "tool", name: `tool${hostile}` },
  );
  const model = onThread(`scout${hostile}`, open, view, {
    session,
    listing: { programs: [anAgent(`scout${hostile}`, `1.0${hostile}`)], version: `2.0${hostile}` },
    dms: { [`scout${hostile}`]: aDm(`scout${hostile}`, [open]) },
    chat: { state: "down", why: { kind: "unreachable", message: `chat${hostile}` } },
    agent: { state: "down", why: { kind: "unreachable", message: `agent${hostile}` } },
    notice: { kind: "not-sent", problem: { said: `said${hostile}` } },
  });

  for (const where of [{ screen: "agents" as const }, { screen: "threads" as const, agent: `scout${hostile}` }, { screen: "thread" as const, agent: `scout${hostile}`, thread: "th_1" }]) {
    const screen = screenOf({ ...model, where }, { now });
    const all = [...stringsIn(screen)];
    assert.ok(all.length > 3);
    for (const text of all) assert.doesNotMatch(text, ACTED_ON, `${screen.kind}: ${JSON.stringify(text)}`);
  }
});
