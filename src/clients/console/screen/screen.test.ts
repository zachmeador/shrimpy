import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantItem, sessionView, toolItem, userItem, workingView } from "../../../contracts/agent/testing/index.ts";
import type { Status } from "../state/index.ts";
import {
  aChatServer,
  aDm,
  agentMember,
  aListing,
  aMessage,
  aModel,
  anAgent,
  aReceipt,
  aRoom,
  aSession,
  aThread,
  aThreadView,
  onThread,
  startRig,
  zach,
} from "../state/testing/index.ts";
import {
  type AgentsScreen,
  farewellLine,
  type Screen,
  screenOf,
  type SessionsScreen,
  type ThreadScreen,
  type ThreadsScreen,
} from "./index.ts";

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
    listing: aListing([anAgent("scout"), anAgent("mechanic"), aChatServer()]),
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

test("an agent on the roster that is not running is listed, and said not to be running", () => {
  const model = aModel({ listing: aListing([anAgent("scout"), aChatServer()], undefined, ["mechanic"]) });

  const screen = agents(screenOf(model, { now }));

  assert.deepEqual(
    screen.rows.map((row) => [row.id, row.detail]),
    [
      ["mechanic", "not running"],
      ["scout", "idle"],
    ],
  );
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
  assert.match(note, /No gateway is running.*shrimpy up/);
});

test("when the gateway is lost the list stays, marked as possibly out of date, and says what was lost", () => {
  const model = aModel({
    gateway: { state: "down", why: { kind: "lost" } },
    listing: aListing([anAgent("scout")]),
  });

  const screen = agents(screenOf(model, { now }));

  assert.equal(screen.stale, true);
  assert.deepEqual(screen.rows.map((row) => row.id), ["scout"]);
  assert.equal(screen.notes.length, 1);
  assert.match(screen.notes[0] ?? "", /gateway/);
});

test("a thread is listed by its name, or else the start of its first message, and says whether the agent is working in it", () => {
  const model = aModel({
    where: { screen: "threads", place: { kind: "agent", name: "scout" } },
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
    where: { screen: "threads", place: { kind: "agent", name: "scout" } },
    chat: { state: "down", why: { kind: "lost" } },
    dms: { scout: aDm("scout", [aThread("th_a", { preview: "Hello" })]) },
  });

  const screen = threads(screenOf(model, { now }));

  assert.equal(screen.stale, true);
  assert.equal(screen.rows.length, 1);
  assert.equal(screen.notes.length, 1);
  assert.match(screen.notes[0] ?? "", /chat server/);
  const empty = threads(screenOf(aModel({ where: { screen: "threads", place: { kind: "agent", name: "scout" } }, chat: { state: "down", why: { kind: "lost" } } }), { now }));
  assert.equal(empty.empty, undefined);
});

test("an agent's sessions list has every session the agent has, one behind a thread you are not in and a trigger's own among them, each with where it is", { timeout: 15_000 }, async (t) => {
  const rig = await startRig(t);
  const yours = await rig.thread("scout", "check the disk");
  const me = (await rig.person()).me;
  const sessions = rig.agents.scout?.agent;
  assert.ok(sessions);
  sessions.session(yours.id, { place: { kind: "dm", with: { name: me.name, kind: "person" }, thread: { main: false, name: null } } });
  sessions.session("th_private", { place: { kind: "dm", with: { name: "mechanic", kind: "agent" }, thread: { main: true, name: null } } });
  sessions.session("th_in_a_room", {
    place: { kind: "room", room: "ops", thread: { main: false, name: "Disk space" } },
    view: workingView([userItem("go")]),
  });
  sessions.session("trigger:nightly", { place: { kind: "trigger", trigger: "nightly" } });
  // An agent that has not learned where a session is lists it with no place.
  sessions.session("th_unplaced");
  await rig.until((model) => model.where.screen === "threads", "the agent's threads");

  rig.state.switchLists();
  const listed = await rig.until((model) => model.sessions?.length === 5, "the agent's sessions");

  const screen = screenOf(listed, { now });
  assert.equal(screen.kind, "sessions");
  const { rows } = screen as SessionsScreen;
  assert.deepEqual(
    rows.map((row) => [row.id, row.working]),
    [
      [yours.id, false],
      ["th_private", false],
      ["th_in_a_room", true],
      ["trigger:nightly", false],
      ["th_unplaced", false],
    ],
  );
  const [mine, private_, room, trigger, unplaced] = rows.map((row) => row.label);
  assert.match(mine ?? "", /DM/);
  assert.doesNotMatch(mine ?? "", /mechanic/);
  assert.match(private_ ?? "", /mechanic/);
  assert.match(room ?? "", /ops.*Disk space/);
  assert.match(trigger ?? "", /nightly/);
  assert.equal(unplaced, "th_unplaced", "its address, since that is all there is to say");
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

test("a message shows as it now stands: marked when it was edited, as deleted when it was, with the emoji on it and who put them there", () => {
  const open = aThread("th_1", { preview: "go" });
  const view = aThreadView(open, [
    aMessage("msg_1", zach, "typo fixed", {
      sentAt: at(10, 3, 14, 5),
      editedAt: at(10, 3, 14, 9),
      reactions: [
        { emoji: "\u{1F44D}", memberIds: [scout.id, zach.id] },
        { emoji: "\u{1F389}", memberIds: [zach.id] },
      ],
    }),
    aMessage("msg_2", zach, "", { deleted: true, editedAt: at(10, 3, 14, 9) }),
    aMessage("msg_3", scout, "as written"),
  ]);

  const [edited, deleted, plain] = thread(screenOf(onThread("scout", open, view), { now })).messages;

  assert.deepEqual([edited?.edited, edited?.reactions], ["edited 14:09", "\u{1F44D} scout, zach  \u{1F389} zach"]);
  assert.deepEqual([deleted?.deleted, deleted?.text, deleted?.edited, deleted?.reactions], [true, "This message was deleted.", undefined, undefined]);
  assert.deepEqual([plain?.deleted, plain?.edited, plain?.reactions, plain?.text], [false, undefined, undefined, "as written"]);
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

test("the line saying who is working says how to stop them, in a DM and in a room alike", () => {
  const busy = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });
  const inRoom = aThread("th_2", { preview: "go", working: [{ memberId: scout.id, since: now }] });
  const room = aModel({
    where: { screen: "thread", place: { kind: "room", id: "ch_2" }, thread: "th_2" },
    rooms: { ch_2: aRoom("ops", ["scout"], [inRoom]) },
  });

  assert.match(thread(screenOf(onThread("scout", busy, undefined), { now })).working ?? "", /scout is working.*\/stop/);
  assert.match(thread(screenOf(room, { now })).working ?? "", /scout is working.*\/stop/);
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
  assert.match(agentLost.notes[0] ?? "", /Lost the connection to scout/);
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

test("an agent that is not running is said to start here when this machine has its home, and where it lives when it has none", () => {
  const open = aThread("th_1", { preview: "go" });
  const gone = { state: "down" as const, why: { kind: "not-registered" as const } };
  const homes = (agent: string) => ({ found: agent === "scout", where: "/folder/agents" });
  const noteOn = (name: string, parts: Parameters<typeof onThread>[3]) =>
    thread(screenOf(onThread(name, open, undefined, { agent: gone, ...parts }), { now })).notes;

  assert.match(noteOn("scout", { homes }).join("\n"), /shrimpy agent serve scout/);
  const elsewhere = noteOn("crab", { homes }).join("\n");
  assert.ok(!/agent serve|shrimpy up/.test(elsewhere), elsewhere);
  assert.ok(elsewhere.includes("/folder/agents"), "and it says where it looked");
  assert.match(noteOn("crab", {}).join("\n"), /shrimpy agent serve crab/, "a console that was not told says to start it here");
});

test("a program that runs another version of Shrimpy is named with its version", () => {
  const model = aModel({
    where: { screen: "threads", place: { kind: "agent", name: "scout" } },
    listing: aListing([anAgent("scout", "9.9.9"), aChatServer("8.8.8")], "7.7.7"),
  });

  const { notes } = threads(screenOf(model, { now }));

  assert.equal(notes.length, 3);
  assert.match(notes[0] ?? "", /gateway.*7\.7\.7/);
  assert.match(notes[1] ?? "", /chat server.*8\.8\.8/);
  assert.match(notes[2] ?? "", /agent scout.*9\.9\.9/);
});

test("a message that was not sent says the message is still in the editor", () => {
  const open = aThread("th_1", { preview: "go" });
  const notice = { kind: "not-sent" as const, problem: { said: "The disk is full." } };

  const { notes } = thread(screenOf(onThread("scout", open, undefined, { notice }), { now }));

  assert.equal(notes.length, 1);
  assert.match(notes[0] ?? "", /The disk is full.*still in the editor/);
});

test("the line for leaving names the thread, says the work continues, and says how to stop it", () => {
  const line = farewellLine("scout", "th_4k9x2m7q0b3d");

  assert.match(line, /scout is still working in thread th_4k9x2m7q0b3d.*continues/);
  assert.match(line, /\/stop/);
  assert.match(line, /shrimpy sessions stop th_4k9x2m7q0b3d --agent scout/);
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
  const stranger = { id: "mem_evil", kind: "person" as const, name: `Evil${hostile}` };
  const open = aThread("th_1", { name: `Name${hostile}`, preview: `Preview${hostile}`, working: [{ memberId: scout.id, since: now }] });
  const view = aThreadView(open, [
    aMessage("msg_1", stranger, `text${hostile}`, { receipts: [aReceipt("scout", "failed", `detail${hostile}`)] }),
    aMessage("msg_2", scout, `reply${hostile}`, { reactions: [{ emoji: `\u{1F44D}${hostile}`, memberIds: [stranger.id] }] }),
  ]);
  const session = workingView(
    [
      userItem(`shown${hostile}`),
      assistantItem(`answer${hostile}`, { thinking: `thinking${hostile}`, streaming: true }),
      toolItem(`tool${hostile}`, { args: { command: `echo ${hostile}` }, output: `output${hostile}`, notes: [`note${hostile}`] }),
    ],
    { kind: "tool", name: `tool${hostile}` },
  );
  session.status.queued = [{ mode: "steer", text: `queued${hostile}` }];
  const sessions = [
    aSession("th_1", { place: { kind: "dm", with: { name: `mechanic${hostile}`, kind: "agent" }, thread: { main: false, name: `thread${hostile}` } } }),
    aSession(`trigger:${hostile}`, { place: { kind: "trigger", trigger: `nightly${hostile}` } }),
    aSession(`th_2${hostile}`, { place: { kind: "room", room: `ops${hostile}`, thread: { main: true, name: null } } }),
    aSession(`th_3${hostile}`),
  ];
  const model = onThread(`scout${hostile}`, open, view, {
    session,
    sessions,
    refusal: `refused${hostile}`,
    listing: aListing([anAgent(`scout${hostile}`, `1.0${hostile}`)], `2.0${hostile}`),
    dms: { [`scout${hostile}`]: aDm(`scout${hostile}`, [open]) },
    rooms: { ch_2: aRoom(`ops${hostile}`, [`scout${hostile}`], [open]) },
    chat: { state: "down", why: { kind: "unreachable", message: `chat${hostile}` } },
    agent: { state: "down", why: { kind: "unreachable", message: `agent${hostile}` } },
    notice: { kind: "not-sent", problem: { said: `said${hostile}` } },
  });
  const dm = { kind: "agent" as const, name: `scout${hostile}` };
  const room = { kind: "room" as const, id: "ch_2" };
  const statuses: Record<"agent" | "room", Status> = {
    agent: {
      at: now,
      about: {
        kind: "agent",
        name: `scout${hostile}`,
        running: true,
        version: `1.0${hostile}`,
        reached: true,
        doing: { kind: "retrying", error: `error${hostile}` },
        session: { queued: 1, model: { provider: `provider${hostile}`, id: `model${hostile}` }, usage: { input: 1, output: 2, cost: 0.5 } },
        othersWorking: 1,
      },
    },
    room: { at: now, about: { kind: "room", agents: [{ name: `scout${hostile}`, running: true, working: true }] } },
  };

  for (const where of [
    { screen: "agents" as const },
    { screen: "threads" as const, place: dm },
    { screen: "thread" as const, place: dm, thread: "th_1" },
    { screen: "threads" as const, place: room },
    { screen: "thread" as const, place: room, thread: "th_1" },
    { screen: "sessions" as const, agent: `scout${hostile}` },
    { screen: "session" as const, agent: `scout${hostile}`, session: "th_1" },
    { screen: "session" as const, agent: `scout${hostile}`, session: `trigger:${hostile}` },
    { screen: "session" as const, agent: `scout${hostile}`, session: `th_3${hostile}` },
  ]) {
    const status = where.screen === "thread" ? statuses[where.place.kind] : undefined;
    const screen = screenOf({ ...model, where, status }, { now });
    const all = [...stringsIn(screen)];
    assert.ok(all.length > 3);
    if (screen.kind === "thread") assert.ok(screen.status !== undefined, "the reading is on the screen");
    for (const text of all) assert.doesNotMatch(text, ACTED_ON, `${screen.kind}: ${JSON.stringify(text)}`);
  }
});
