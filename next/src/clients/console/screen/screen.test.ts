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
    screen.rows.map((row) => [row.id, row.working]),
    [
      ["mechanic", false],
      ["scout", true],
    ],
  );
  assert.equal(screen.stale, false);
  assert.equal(screen.empty, undefined);
  assert.deepEqual(screen.notes, []);
});

test("with no agents it says what to start, and with no gateway it says that instead", () => {
  const none = agents(screenOf(aModel(), { now }));
  assert.match(none.empty ?? "", /shrimpy agent serve/);

  const away = agents(
    screenOf(aModel({ gateway: { state: "down", why: { kind: "not-running" } }, listing: undefined, chat: { state: "down", why: { kind: "not-registered" } } }), { now }),
  );
  assert.equal(away.empty, undefined);
  const [note, ...more] = away.notes;
  assert.ok(note);
  assert.deepEqual(more, []);
  assert.equal(note.tone, "warn");
  assert.match(note.text, /No gateway is running.*shrimpy up/);
});

test("when the gateway is lost the list stays, marked as possibly out of date, and says what was lost", () => {
  const model = aModel({
    gateway: { state: "down", why: { kind: "lost" } },
    listing: { programs: [anAgent("scout")], version: "0.0.0" },
  });

  const screen = agents(screenOf(model, { now }));

  assert.equal(screen.stale, true);
  assert.deepEqual(screen.rows.map((row) => row.id), ["scout"]);
  assert.equal(screen.notes.length, 1);
  assert.match(screen.notes[0]?.text ?? "", /gateway/);
});

test("a thread is listed by its name, or else the start of its first message, and says whether the agent is working in it", () => {
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

  assert.deepEqual(
    screen.rows.map((row) => [row.id, row.label, row.working]),
    [
      ["th_a", "Check the disk usage", true],
      ["th_b", "Dentist", false],
      ["th_c", "(no messages yet) [main]", false],
      ["th_d", "Old plans [archived]", false],
    ],
  );
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
  assert.equal(screen.notes.length, 1);
  assert.match(screen.notes[0]?.text ?? "", /chat server/);
  const empty = threads(screenOf(aModel({ where: { screen: "threads", agent: "scout" }, chat: { state: "down", why: { kind: "lost" } } }), { now }));
  assert.equal(empty.empty, undefined);
});

test("a thread shows who said what, oldest first, as themselves or as someone else", () => {
  const open = aThread("th_1", { preview: "Hello there", updatedAt: at(10, 3, 14, 5) });
  const view = aThreadView(open, [
    aMessage("msg_1", zach, "Hello there", { sentAt: at(10, 3, 14, 5) }),
    aMessage("msg_2", scout, "Hi!\n\n- one\n- two", { sentAt: at(10, 3, 14, 6) }),
  ]);

  const screen = thread(screenOf(onThread("scout", open, view), { now }));

  assert.deepEqual(
    screen.messages.map((message) => [message.who, message.mine, message.agent, message.text]),
    [
      ["zach", true, false, "Hello there"],
      ["scout", false, true, "Hi!\n\n- one\n- two"],
    ],
  );
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

  const notes = thread(screenOf(onThread("scout", open, view), { now })).messages.map((message) => message.notes);

  assert.deepEqual(notes.slice(0, 2), [[], []]);
  const [failed, stopped, skipped] = notes.slice(2).map((each) => each.join("\n"));
  assert.match(failed ?? "", /^scout failed: The model failed: it was rude$/);
  assert.match(stopped ?? "", /^scout stopped/);
  assert.match(skipped ?? "", /^scout skipped/);
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

  assert.match(screen.working ?? "", /scout is working.*answering/);
  assert.deepEqual(
    screen.work?.steps.map((step) => step.kind),
    ["thinking", "text", "tool", "text"],
  );
  const thinking = screen.work.steps.at(0);
  const tool = screen.work.steps.at(2);
  assert.equal(thinking?.kind === "thinking" && thinking.text, "I should list the files first.");
  assert.ok(tool?.kind === "tool");
  assert.equal(tool.call, "$ ls -la");
  assert.deepEqual(tool.output, ["a", "b"]);
  assert.equal(tool.tone, "good");
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
  assert.match(busy.working ?? "", /running bash/);
  assert.equal(idle.work, undefined);
  assert.equal(idle.working, undefined);
});

test("the agent working with no session to watch yet is still shown as working", () => {
  const open = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });

  const screen = thread(screenOf(onThread("scout", open, aThreadView(open, [aMessage("msg_1", zach, "go")])), { now }));

  assert.match(screen.working ?? "", /scout is working/);
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
  assert.match(screen.work.earlier ?? "", /3 earlier steps/);
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

  const [answer, interrupted, waiting, failed] = steps;
  assert.ok(answer?.kind === "text" && answer.note !== undefined, "the answer that was cut off says so");
  assert.ok(interrupted?.kind === "tool");
  assert.equal(interrupted.tone, "bad");
  assert.deepEqual(interrupted.notes, ["The agent restarted; the call was not run again."]);
  assert.ok(waiting?.kind === "tool");
  assert.equal(waiting.tone, "idle");
  assert.ok(failed?.kind === "tool");
  assert.equal(failed.tone, "bad");
  assert.deepEqual(failed.output, ["no such file"]);
});

test("a tool's output shows its last lines, and says how many came before", () => {
  const open = aThread("th_1", { preview: "go" });
  const output = Array.from({ length: 10 }, (_, index) => `line ${String(index + 1)}`).join("\n");

  const screen = thread(screenOf(onThread("scout", open, undefined, { session: workingView([userItem("go"), toolItem("bash", { output })]) }), { now }));

  const [step] = screen.work?.steps ?? [];
  assert.ok(step?.kind === "tool");
  assert.deepEqual(step.output, ["line 5", "line 6", "line 7", "line 8", "line 9", "line 10"]);
  assert.match(step.earlier ?? "", /4 earlier lines/);
});

test("a thread says when older messages are not shown, and how to read them", () => {
  const open = aThread("th_1", { preview: "x" });
  const view = aThreadView(open, [aMessage("msg_1", zach, "x")], 37);

  const screen = thread(screenOf(onThread("scout", open, view), { now }));

  assert.match(screen.lead ?? "", /37 earlier messages.*shrimpy read th_1/);
});

test("while chat or the agent is lost, what is shown is marked, and the notes say what was lost", () => {
  const open = aThread("th_1", { preview: "go" });
  const view = aThreadView(open, [aMessage("msg_1", zach, "go")]);
  const base = onThread("scout", open, view, { session: workingView([userItem("go")]) });

  const chatLost = thread(screenOf({ ...base, chat: { state: "down", why: { kind: "lost" } } }, { now }));
  const agentLost = thread(screenOf({ ...base, agent: { state: "down", why: { kind: "lost" } } }, { now }));

  assert.equal(chatLost.workStale, false);
  assert.equal(agentLost.workStale, true);
  assert.equal(agentLost.messages.length, 1);
  assert.notEqual(agentLost.work, undefined, "the work stays");
  assert.equal(agentLost.notes.length, 1);
  assert.match(agentLost.notes[0]?.text ?? "", /Lost the connection to scout/);
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
  assert.notEqual(stillMarked.working, undefined, "chat still says it is working, so that is said");
});

test("the gateway being gone explains why nothing is registered, and is said once", () => {
  const open = aThread("th_1", { preview: "go" });
  const model = onThread("scout", open, undefined, {
    gateway: { state: "down", why: { kind: "not-running" } },
    chat: { state: "down", why: { kind: "not-registered" } },
    agent: { state: "down", why: { kind: "not-registered" } },
  });

  assert.equal(thread(screenOf(model, { now })).notes.length, 1);
  assert.equal(thread(screenOf({ ...model, gateway: { state: "up" } }, { now })).notes.length, 2);
});

test("a program that runs another version of Shrimpy is named with its version", () => {
  const model = aModel({
    where: { screen: "threads", agent: "scout" },
    listing: { programs: [anAgent("scout", "9.9.9"), aChatServer("8.8.8")], version: "7.7.7" },
  });

  const notes = threads(screenOf(model, { now })).notes.map((note) => note.text);

  assert.equal(notes.length, 3);
  assert.match(notes[0] ?? "", /gateway.*7\.7\.7/);
  assert.match(notes[1] ?? "", /chat server.*8\.8\.8/);
  assert.match(notes[2] ?? "", /agent scout.*9\.9\.9/);
});

test("a message that was not sent says the message is still in the editor, and a stop is told apart from a problem", () => {
  const open = aThread("th_1", { preview: "go" });
  const on = (notice: NonNullable<ReturnType<typeof aModel>["notice"]>) =>
    thread(screenOf(onThread("scout", open, undefined, { notice }), { now })).notes.map((note) => [note.tone, note.text]);

  assert.deepEqual(
    on({ kind: "not-sent", problem: { said: "The disk is full." } }).map(([tone, text]) => [tone, /The disk is full.*still in the editor/.test(text ?? "")]),
    [["warn", true]],
  );
  assert.deepEqual(on({ kind: "stopped" }).map(([tone]) => tone), ["info"]);
  assert.deepEqual(on({ kind: "nothing-to-stop" }).map(([tone]) => tone), ["warn"]);
});

test("the line for leaving names the thread, says the work continues, and says how to stop it", () => {
  const line = farewellLine("scout", "th_4k9x2m7q0b3d");

  assert.match(line, /scout is still working in thread th_4k9x2m7q0b3d.*continues/);
  assert.match(line, /Esc/);
  assert.match(line, /shrimpy sessions stop <home> th_4k9x2m7q0b3d/);
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
