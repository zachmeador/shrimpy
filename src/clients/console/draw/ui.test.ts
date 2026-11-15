import assert from "node:assert/strict";
import { hostname } from "node:os";
import { test, type TestContext } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { setCapabilityOverrides, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { assistantItem, toolItem, userItem } from "../../../contracts/agent/testing/index.ts";
import { Roster } from "../../../contracts/gateway/index.ts";
import { connectGateway, joinAsMachine, readMachine } from "../../../contracts/gateway/node.ts";
import { startTestGateway } from "../../../contracts/gateway/testing/index.ts";
import { eventually, FakeTerminal, settle, stopAfter, tempDir, until, within } from "../../../lib/testing/index.ts";
import { localTime } from "../../../lib/time/index.ts";
import { SHRIMPY_RELEASE_NAME } from "../../../lib/version/index.ts";
import type { Model, Notice, Status } from "../state/index.ts";
import {
  aChatServer,
  agentMember,
  aListing,
  aDm,
  aMessage,
  aModel,
  anAgent,
  aReceipt,
  aRoom,
  aSession,
  aThread,
  aThreadView,
  type FakeState,
  fakeState,
  onSession,
  onThread,
  sessionView,
  startRig,
  workingView,
  zach,
} from "../state/testing/index.ts";
import { QUIT_AGAIN, READ_ONLY_TAG, screenOf, type ThreadScreen } from "../screen/index.ts";
import { type Drawing, startDrawing } from "./index.ts";

/** Lines of a drawing as a person reads them: without styles, and without the spaces that pad them. */
const visible = (lines: string[]): string[] => lines.map((line) => stripTerminalSequences(line).trimEnd());

const scout = agentMember("scout");
const at = (hour: number, minute: number): number => new Date(2026, 9, 3, hour, minute).getTime();
const now = at(15, 0);

const UP = "\u001b[A";
const DOWN = "\u001b[B";
const LEFT = "\u001b[D";
const RIGHT = "\u001b[C";
const ENTER = "\r";
const BACKSPACE = "\u007f";
const ESC = "\u001b";
/** What a terminal that reports keys being let go sends when Esc is. */
const ESC_RELEASED = "\u001b[27;1:3u";
const TAB = "\t";
const CTRL_C = "\u0003";
const CTRL_N = "\u000e";
const CTRL_O = "\u000f";
const CTRL_T = "\u0014";

interface Started {
  state: FakeState;
  terminal: FakeTerminal;
  drawing: Drawing;
  /** What the person sees now, at a width. */
  lines: (width?: number) => string[];
}

function start(t: TestContext, model: Model, size: { columns?: number; rows?: number } = {}): Started {
  const state = fakeState(model);
  const terminal = new FakeTerminal(size.columns ?? 80, size.rows ?? 24);
  const drawing = startDrawing({ state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  return { state, terminal, drawing, lines: (width = terminal.columns) => visible(drawing.render(width)) };
}

/** What was posted, of everything the drawing asked of the state. */
const sent = (state: FakeState): string[] => state.calls.filter((call) => call.startsWith("send "));

const open = aThread("th_1", { preview: "Check the disk usage", updatedAt: at(14, 5) });
const conversation = (): Model =>
  onThread(
    "scout",
    open,
    aThreadView(open, [
      aMessage("msg_1", zach, "Check the disk usage", { sentAt: at(14, 5), receipts: [aReceipt("scout", "answered")] }),
      aMessage("msg_2", scout, "Disk is **43%** used.", { sentAt: at(14, 6) }),
      aMessage("msg_3", zach, "And the logs?", { sentAt: at(14, 7), receipts: [aReceipt("scout", "failed", "The model failed: nope")] }),
    ]),
  );

/** What a command in a DM's thread does, as the screen says it. */
function lineOf(name: string): string {
  const screen = screenOf(conversation(), { now });
  assert.equal(screen.kind, "thread");
  const found = (screen as ThreadScreen).commands.find((command) => command.name === name);
  assert.ok(found, `${name} is a command`);
  return found.line;
}

test("a slash opens the list of commands, which typing narrows and Esc closes", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  const drawn = (): string => lines().join("\n");

  terminal.type("/");
  await until(() => drawn().includes(lineOf("/stop")) && drawn().includes(lineOf("/status")), "the list of both kinds of command");
  terminal.type("sto");
  await until(() => !drawn().includes(lineOf("/status")), "the list to narrow");
  assert.ok(drawn().includes(lineOf("/stop")));
  terminal.type("x");
  await until(() => !drawn().includes(lineOf("/stop")), "the list to close, since nothing matches");
  terminal.type(BACKSPACE);
  await until(() => drawn().includes(lineOf("/stop")), "the list to open again");

  terminal.type(ESC);
  assert.ok(!drawn().includes(lineOf("/stop")), "escape closes the list");
  assert.match(drawn(), /\n \/sto\n/, "and leaves the text as it was");
  assert.deepEqual(state.calls, [], "without leaving the thread");
  terminal.type(ESC);
  assert.deepEqual(state.calls, ["back"], "the next escape goes back");
});

test("Enter acts on the command chosen in the list, and Tab only puts it in the editor", async (t) => {
  // A session behind the thread, which Tab would turn over to if the list did not have it.
  const { terminal, state, lines } = start(t, { ...conversation(), session: sessionView() });
  const drawn = (): string => lines().join("\n");

  terminal.type("/st");
  await until(() => drawn().includes(lineOf("/stop")), "the list of commands");
  terminal.type(DOWN);
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["send /stop"], "enter completes the chosen command and sends it");
  assert.ok(!drawn().includes(lineOf("/stop")), "and closes the list");

  terminal.type("/sta");
  await until(() => drawn().includes(lineOf("/status")), "the list of commands");
  terminal.type(TAB);
  assert.deepEqual(state.calls, ["send /stop"], "tab acts on nothing");
  assert.match(drawn(), /\n \/status\n/, "it puts the command in the editor");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["send /stop", "status"], "a command for the terminal is acted on and not sent");
});

test("a text that starts with a slash is never posted as a message", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  const drawn = (): string => lines().join("\n");

  terminal.type("/etc/hosts is wrong");
  await settle();
  assert.ok(!drawn().includes(lineOf("/stop")), "a text that is no command opens no list");
  terminal.type(ENTER);
  assert.deepEqual(sent(state), [], "nothing is posted");
  assert.match(drawn(), /\n \/etc\/hosts is wrong\n/, "and it is back in the editor to be corrected");

  // In backticks, or after a mention, it is a message.
  terminal.type(CTRL_C);
  terminal.type("`/etc/hosts` is wrong");
  terminal.type(ENTER);
  terminal.type("@scout /stop");
  terminal.type(ENTER);
  assert.deepEqual(sent(state), ["send `/etc/hosts` is wrong", "send @scout /stop"]);

  // A command that takes nothing is not acted on with something after it.
  terminal.type("/status now");
  terminal.type(ENTER);
  assert.deepEqual(sent(state).length, 2);
  assert.ok(!state.calls.includes("status"));
});

test("/status shows a block for the person alone, which goes once a message is sent or the thread is left", { timeout: 30_000 }, async (t) => {
  const rig = await startRig(t, { now: () => now });
  const thread = await rig.thread("scout", "go");
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render(100)).join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  const posted = async (): Promise<string[]> => (await (await rig.person()).read(thread.id, null, 10)).map((message) => message.text);
  /** The header of the block `/status` shows, as the screen words it. */
  const header = async (): Promise<string> => {
    const model = await rig.until((each) => each.status !== undefined, "the reading");
    const block = (screenOf(model, { now }) as ThreadScreen).status;
    assert.ok(block);
    return block.header;
  };
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.thread?.messages.length === 1, "the thread");

  terminal.type("/status");
  terminal.type(ENTER);
  const shown = await header();
  await seen(shown);
  assert.ok(drawn().includes(localTime(now)), "when it was read");
  assert.deepEqual(await posted(), ["go"], "nothing was posted");

  terminal.type("hello");
  terminal.type(ENTER);
  await until(() => !drawn().includes(shown), "the reading to go when a message is sent");
  assert.deepEqual(await posted(), ["go", "hello"]);

  terminal.type("/status");
  terminal.type(ENTER);
  await seen(await header());
  terminal.type(ESC);
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  rig.state.openThread(thread.id);
  await seen("hello");
  await settle();
  assert.ok(!drawn().includes(shown), "the reading is gone once the thread has been left");
});

const SMALL = { provider: "local", id: "small-model" };
const BIG = { provider: "local", id: "big-model" };
const TWO_MODELS = { models: [{ ...BIG, name: "Big Model" }, { ...SMALL, name: "Small Model" }], default: SMALL };

test("/model and a space lists default and the agent's models, and choosing one posts the command", async (t) => {
  const { terminal, state, lines } = start(t, conversation(), { columns: 100 });
  state.answers.models = TWO_MODELS;
  const drawn = (): string => lines().join("\n");

  terminal.type("/model");
  await until(() => drawn().includes(lineOf("/model")), "the command's line");
  terminal.type(" ");
  await until(() => drawn().includes("local/big-model"), "the list of models");
  assert.ok(drawn().includes("local/small-model"));
  assert.match(drawn(), /default.*local\/small-model/, "default says which model it is");
  assert.ok(drawn().indexOf("default") < drawn().indexOf("local/big-model"), "and comes first");
  terminal.type("big");
  await until(() => !drawn().includes("local/small-model"), "the list to narrow");
  terminal.type(ENTER);

  assert.deepEqual(state.calls, ["send /model local/big-model"], "it is a message, which the agent acts on");
});

test("/model alone posts nothing, and a model chosen in a thread not started yet posts the command", async (t) => {
  const { terminal, state, lines } = start(t, conversation(), { columns: 100 });
  state.answers.models = TWO_MODELS;
  const drawn = (): string => lines().join("\n");

  terminal.type("/model");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["model"], "the terminal says which model the thread uses");

  state.show(aModel({ where: { screen: "thread", place: { kind: "agent", name: "scout" }, thread: undefined }, listing: aListing([anAgent("scout"), aChatServer()]) }));
  terminal.type("/model big");
  await until(() => drawn().includes("local/big-model"), "the list of models");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["model", "send /model local/big-model"]);
});

test("a model typed whole and followed at once by Enter is the model chosen", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  state.answers.models = TWO_MODELS;
  const drawn = (): string => lines().join("\n");

  terminal.type("/model ");
  await until(() => drawn().includes("local/small-model"), "the list of models");
  terminal.type("local/big-model");
  terminal.type(ENTER);

  assert.deepEqual(state.calls, ["send /model local/big-model"], "the list still had default chosen, which no longer fit what was typed");
});

test("in a room /model is posted only with an agent named before it", async (t) => {
  const inRoom = aThread("th_2", { preview: "go" });
  const room = aModel({
    where: { screen: "thread", place: { kind: "room", id: "ch_2" }, thread: "th_2" },
    listing: aListing([anAgent("scout"), aChatServer()]),
    rooms: { ch_2: aRoom("ops", ["scout"], [inRoom]) },
  });
  const { terminal, state, lines } = start(t, room, { columns: 140 });
  const drawn = (): string => lines().join("\n");
  const here = screenOf(room, { now });
  assert.equal(here.kind, "thread");
  const model = (here as ThreadScreen).commands.find((command) => command.name === "/model");
  assert.ok(model, "/model is a command in a room");
  assert.ok(model.line.includes("@scout /model provider/id") && model.line.includes("@all"), "and its line teaches how to write it there");

  terminal.type("/");
  await until(() => drawn().includes(model.line), "the list of commands, with /model among them");
  terminal.type("model local/big-model");
  terminal.type(ENTER);
  assert.deepEqual(sent(state), [], "written first, it mentions nobody, so it is not posted");
  assert.match(drawn(), /\n \/model local\/big-model\n/, "and the text stays in the editor");

  terminal.type(CTRL_C);
  terminal.type("/model");
  terminal.type(ENTER);
  terminal.type(CTRL_C);
  terminal.type("@scout /model local/big-model");
  terminal.type(ENTER);
  assert.deepEqual(sent(state), ["send @scout /model local/big-model"]);
  assert.ok(!state.calls.includes("model"), "and /model alone is not answered there");
});

test("Esc goes back from a thread where the agent is working, and stops nothing", async (t) => {
  const busy = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });
  const model = onThread("scout", busy, aThreadView(busy, []), {
    session: workingView([userItem("go"), toolItem("bash", { args: { command: "ls" } })], { kind: "tool", name: "bash" }),
  });
  const { terminal, state, lines } = start(t, model, { columns: 100 });
  assert.ok(lines().join("\n").includes("/stop"), "the line that says the agent is working says how to stop it");

  terminal.type(ESC);
  terminal.type(ESC_RELEASED);
  await until(() => state.calls.length > 0, "escape to be pressed");
  await settle();

  assert.deepEqual(state.calls, ["back"], "a press is one press, whether or not the terminal reports the key being let go, and nothing is stopped");
});

test("Ctrl+O shows tool calls in full and Ctrl+T the thinking, and each press again puts it back", (t) => {
  const thinking = Array.from({ length: 6 }, (_, index) => `thought ${String(index + 1)}`).join("\n");
  const output = Array.from({ length: 20 }, (_, index) => `line ${String(index + 1)}`).join("\n");
  const work = workingView(
    [
      userItem("go"),
      assistantItem("Looking.", { thinking, stopReason: "toolUse" }),
      toolItem("bash", { args: { command: "ls", timeout: 30 }, status: "done", output }),
    ],
    { kind: "working" },
  );
  const working = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });
  const where = {
    "work in your DM thread": onThread("scout", working, undefined, { session: work }),
    "a session being watched": onSession("scout", aSession("th_2"), work),
  };

  for (const [shown, model] of Object.entries(where)) {
    const { terminal, lines } = start(t, model);
    const drawn = (): string => lines().join("\n");

    assert.doesNotMatch(drawn(), /thought 1\b|line 1\b|timeout/, `${shown}: brief to begin with`);
    assert.match(drawn(), /thought 6\b/);
    assert.match(drawn(), /line 20\b/);

    terminal.type(CTRL_O);
    assert.match(drawn(), /line 1\b/, shown);
    assert.match(drawn(), /"timeout": 30/);
    assert.doesNotMatch(drawn(), /thought 1\b/, `${shown}: only the tool call changed`);
    terminal.type(CTRL_O);
    assert.doesNotMatch(drawn(), /line 1\b|timeout/, shown);

    terminal.type(CTRL_T);
    assert.match(drawn(), /thought 1\b/, shown);
    assert.doesNotMatch(drawn(), /line 1\b/, `${shown}: only the thinking changed`);
    terminal.type(CTRL_T);
    assert.doesNotMatch(drawn(), /thought 1\b/, shown);
  }
});

test("a message that is not sent comes back to the editor, ahead of anything typed since", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  state.answers.send = { ok: false };

  terminal.type("will not go");
  terminal.type(ENTER);
  await settle();
  await settle();

  assert.match(lines().join("\n"), /\n will not go\n/);
  terminal.type("!");
  terminal.type(ENTER);
  await settle();
  await settle();
  assert.match(lines().join("\n"), /\n will not go!\n/);
});

test("Ctrl+C clears what is typed, and only a second press quits", async (t) => {
  const { terminal, drawing, lines } = start(t, conversation());
  let left = false;
  void drawing.left.then(() => {
    left = true;
  });

  terminal.type("some text");
  terminal.type(CTRL_C);
  await settle();

  assert.doesNotMatch(lines().join("\n"), /some text/);
  assert.equal(lines().at(-1), QUIT_AGAIN);
  assert.equal(left, false, "the first press did not quit");
  terminal.type(CTRL_C);
  await settle();

  assert.equal(left, true);
});

test("leaving a thread whose agent is working stops its spinner, so a list does not redraw for nothing", async (t) => {
  const busy = onThread("scout", aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] }), undefined);
  const { state, terminal } = start(t, busy);
  await until(() => terminal.output().includes("/stop"), "the working line to be drawn");

  const list = aModel({
    where: { screen: "threads", place: { kind: "agent", name: "scout" } },
    listing: aListing([anAgent("scout"), aChatServer()]),
    dms: { scout: aDm("scout", [aThread("th_a", { preview: "Check the disk usage", updatedAt: at(14, 5), working: [{ memberId: scout.id, since: now }] })]) },
  });
  state.show(list);
  await until(() => terminal.output().includes("Check the disk usage"), "the threads to be drawn");
  await settle();
  const drawn = terminal.hides;
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(terminal.hides, drawn, "nothing is drawn again while nothing changes");
});

test("nothing drawn is wider than the terminal, however narrow, whatever the characters", (t) => {
  const model = onThread(
    "scout",
    aThread("th_1", { preview: "日本語のとても長い題名です 🦐🦐🦐", working: [{ memberId: scout.id, since: now }] }),
    aThreadView(open, [
      aMessage("msg_1", zach, "日本語 ".repeat(30) + "averyveryveryveryveryveryverylongwordwithoutanyspacesatall".repeat(3), { sentAt: at(14, 5) }),
      aMessage("msg_2", scout, "| a | b |\n|---|---|\n| 1111111111111111111 | 2222222222222222222 |\n\n```\nlong code line long code line long code line long code line\n```", { sentAt: at(14, 6) }),
    ]),
    {
      session: workingView([userItem("go"), toolItem("bash", { args: { command: "echo " + "x".repeat(200) }, output: "y".repeat(300) }), assistantItem("🦐".repeat(60), { streaming: true })]),
      notice: { kind: "not-sent", problem: { said: "日本語".repeat(20) } },
    },
  );
  const { drawing, state, terminal } = start(t, model);
  const fits = (): void => {
    for (const width of [12, 20, 33, 80, 120]) {
      for (const line of drawing.render(width)) assert.ok(visibleWidth(line) <= width, `${String(visibleWidth(line))} > ${String(width)}: ${line}`);
    }
  };
  fits();

  const place = { kind: "room" as const, room: "日本語のとても長い部屋", thread: { main: false, name: "averyveryveryverylongthreadnamewithoutanyspacesatall".repeat(2) } };
  const sessions = [aSession("th_2", { place, working: true })];
  const agent = { kind: "agent" as const, name: "scout" };
  for (const filter of [LEFT, RIGHT]) {
    state.show({ ...model, where: { screen: "threads", place: agent }, sessions });
    terminal.type(filter);
    fits();
  }
  state.show({ ...model, where: { screen: "session", agent: "scout", session: "th_2" }, sessions });
  fits();
  state.show({ ...model, where: { screen: "thread", place: agent, thread: "th_1", turned: true }, sessions });
  fits();
  terminal.type(CTRL_O);
  terminal.type(CTRL_T);
  fits();
});

test("text from other members and from tools can't reach the terminal, wherever it appears", async (t) => {
  const ESC_ = "\u001b";
  const hostile = `${ESC_}]0;pwned\u0007${ESC_}[999;999H${ESC_}[2J${ESC_}]52;c;cHduZWQ=\u0007${ESC_}[31mred\u009b6n\rover`;
  const stranger = { id: "mem_evil", kind: "person" as const, name: `Evil${hostile}` };
  const thread = aThread("th_1", { name: `Name${hostile}`, preview: `Preview${hostile}`, working: [{ memberId: scout.id, since: now }] });
  const others = [agentMember(`lurker${hostile}`), agentMember(`mechanic${hostile}`)];
  const sessions = [
    aSession("th_9", { place: { kind: "dm", with: { name: `mechanic${hostile}`, kind: "agent" }, thread: { main: false, name: `thread${hostile}` } } }),
    aSession(`trigger:${hostile}`, { place: { kind: "trigger", trigger: `nightly${hostile}` }, working: true }),
    aSession(`th_2${hostile}`, { place: { kind: "room", room: `ops${hostile}`, thread: { main: true, name: null } }, working: true }),
  ];
  const model = onThread(
    "scout",
    thread,
    aThreadView(thread, [
      aMessage("msg_1", stranger, `text${hostile}`, { receipts: [aReceipt("scout", "failed", `detail${hostile}`)] }),
      aMessage("msg_2", scout, `reply [a link](https://evil.example/${hostile}) ${hostile}`, {
        reactions: [{ emoji: `\u{1F44D}${hostile}`, memberIds: [stranger.id] }],
      }),
    ]),
    {
      me: { ...zach, name: `zach${hostile}` },
      session: workingView(
        [
          userItem(`shown${hostile}`),
          assistantItem(`answer${hostile}`, { thinking: `thinking${hostile}`, streaming: true }),
          toolItem(`tool${hostile}`, { args: { command: `echo ${hostile}` }, output: `output${hostile}`, notes: [`note${hostile}`] }),
        ],
        { kind: "tool", name: `tool${hostile}` },
      ),
      sessions,
      workingSessions: { scout: sessions.filter((each) => each.working) },
      listing: aListing([anAgent("scout", `1.0${hostile}`), aChatServer(`3.0${hostile}`)], `2.0${hostile}`),
      rooms: { ch_2: aRoom(`ops${hostile}`, ["scout"], [thread]) },
      readOnly: {
        ch_3: { channel: { id: "ch_3", kind: "dm" as const, name: "x", members: others }, threads: [thread] },
        ch_4: { channel: { id: "ch_4", kind: "room" as const, name: `lab${hostile}`, members: others }, threads: [thread] },
      },
      notice: { kind: "not-sent", problem: { said: `said${hostile}` } },
    },
  );
  model.session?.status.queued.push({ mode: "steer", text: `queued${hostile}` });
  const used = { provider: `provider${hostile}`, id: `model${hostile}` };
  const statuses: Record<"agent" | "room", Status> = {
    agent: {
      at: now,
      about: {
        kind: "agent",
        name: "scout",
        running: true,
        version: `1.0${hostile}`,
        reached: true,
        doing: { kind: "retrying", error: `error${hostile}` },
        session: {
          queued: 1,
          model: used,
          own: true,
          defaultModel: { provider: `home${hostile}`, id: `default${hostile}` },
          usage: { input: 1, output: 2, cost: 0.5 },
          failure: { reason: `reason${hostile}`, detail: `why${hostile}` },
          wakeups: [{ due: now, note: `wake${hostile}` }],
        },
        othersWorking: 1,
      },
    },
    room: { at: now, about: { kind: "room", agents: [{ name: `lurker${hostile}`, running: true, working: true }] } },
  };
  const notices: Notice[] = [
    { kind: "no-command", written: `/path${hostile}`, commands: [`/stop${hostile}`] },
    { kind: "model-is", model: used, own: true, defaultModel: used },
    { kind: "model-unstarted", defaultModel: used },
    { kind: "model-not-shown", problem: { down: { kind: "unreachable", message: `agent${hostile}` } } },
  ];
  const dm = { kind: "agent" as const, name: "scout" };
  const room = { kind: "room" as const, id: "ch_2" };
  const { terminal, drawing, state } = start(t, model);

  const drawn = [...drawing.render(80)];
  const show = (next: Model): void => {
    state.show(next);
    drawn.push(...drawing.render(80));
  };
  show({ ...model, where: { screen: "threads", place: dm } });
  show({ ...model, where: { screen: "session", agent: "scout", session: "th_9" }, refusal: `refused${hostile}` });
  show({ ...model, where: { screen: "thread", place: dm, thread: "th_1", turned: true } });
  show({ ...model, where: { screen: "thread", place: dm, thread: "th_1" }, status: statuses.agent });
  show({ ...model, where: { screen: "threads", place: room } });
  show({ ...model, where: { screen: "thread", place: room, thread: "th_1" }, status: statuses.room });
  show({ ...model, where: { screen: "threads", place: { kind: "read-only", id: "ch_4" } } });
  show({ ...model, where: { screen: "thread", place: { kind: "read-only", id: "ch_3" }, thread: "th_1", agent: "scout" } });
  show({
    ...model,
    chat: { state: "down", why: { kind: "unreachable", message: `chat${hostile}` } },
    agent: { state: "down", why: { kind: "unreachable", message: `gone${hostile}` } },
  });
  for (const notice of notices) show({ ...model, notice });
  // The list `/model` opens has what the agent calls its models.
  show({ ...model, notice: undefined });
  state.answers.models = { models: [{ ...used, name: `Gemma${hostile}` }], default: used };
  terminal.type("/model ");
  await until(() => visible(drawing.render(80)).join("\n").includes("Gemma"), "the list of models");
  drawn.push(...drawing.render(80));
  show({ ...model, where: { screen: "agents" } });
  await until(() => terminal.output().includes(SHRIMPY_RELEASE_NAME), "the terminal to be written");

  // Styles are the console's own, and so are pi-tui's markers of where the cursor is. Once those are taken out, nothing but text is left.
  const own = new RegExp("\\u001b\\[[0-9;:]*m|\\u001b_pi:[^\\u0007]*\\u0007", "g");
  const text = drawn.join("\n").replace(own, "");
  assert.doesNotMatch(text, new RegExp("[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f]"));
  for (const wanted of ["Evil", "text", "detail", "reply", "\u{1F44D}", "answer", "thinking", "output", "note", "said", "shown", "queued", "mechanic", "thread", "refused", "ops", "lab", "lurker", "path", "Gemma"]) {
    assert.ok(text.includes(wanted), wanted);
  }
  // A tool's arguments show as JSON, where the payload's words are harmless text. Its sequences must never arrive as sequences.
  const written = terminal.output();
  for (const sequence of [`${ESC_}]0;pwned`, `${ESC_}[999;999H`, `${ESC_}]52;c;cHduZWQ`, "\u009b6n"]) {
    assert.ok(!written.includes(sequence), `${JSON.stringify(sequence)} reached the terminal`);
  }
});

test("a link in a message shows where it goes instead of hiding it", (t) => {
  setCapabilityOverrides({ hyperlinks: true });
  const thread = aThread("th_1", { preview: "x" });
  const model = onThread("scout", thread, aThreadView(thread, [aMessage("msg_1", scout, "see [the bank](https://evil.example/login)")]));
  const { drawing } = start(t, model);

  const text = drawing.render(120).join("\n");

  assert.doesNotMatch(text, /\u001b\]8;/);
  assert.match(visible(drawing.render(120)).join("\n"), /the bank \(https:\/\/evil\.example\/login\)/);
});

test("the draft in the editor survives losing chat and the agent, and finding them again", (t) => {
  const { terminal, state, lines } = start(t, conversation());
  terminal.type("half a thought");

  state.show({ ...conversation(), chat: { state: "down", why: { kind: "lost" } }, agent: { state: "down", why: { kind: "lost" } } });
  assert.match(lines().join("\n"), /\n half a thought\n/);
  state.show(conversation());

  assert.match(lines().join("\n"), /\n half a thought\n/);
});

test("a receipt adds nothing under a message the agent answered or kept silent about", (t) => {
  const said = (receipts: ReturnType<typeof aReceipt>[]): Model =>
    onThread("scout", open, aThreadView(open, [aMessage("msg_1", zach, "Check the disk usage", { sentAt: at(14, 5), receipts })]));
  const { state, lines } = start(t, said([]));
  const bare = lines();

  for (const status of ["answered", "silent"] as const) {
    state.show(said([aReceipt("scout", status)]));
    assert.deepEqual(lines(), bare, status);
  }
  state.show(said([aReceipt("scout", "failed", "it was rude")]));
  assert.ok(lines().join("\n").includes("it was rude"), "while one that failed says why");
});

test("a thread or a watched session that starts after its first item says how to read the rest", (t) => {
  const thread = aThread("th_1", { preview: "x" });
  const { state, lines } = start(t, onThread("scout", thread, aThreadView(thread, [aMessage("msg_1", zach, "x")], 37)), { columns: 140 });
  assert.ok(lines().join("\n").includes("shrimpy read th_1"), lines().join("\n"));

  state.show(onSession("scout", aSession("trigger:nightly"), sessionView({ items: [userItem("the newest", 140)], before: 139 })));
  assert.ok(lines().join("\n").includes("shrimpy sessions read trigger:nightly --agent scout"), lines().join("\n"));
  state.show(onSession("scout", aSession("trigger:nightly"), sessionView({ items: [userItem("the first", 1)] })));
  assert.ok(!lines().join("\n").includes("shrimpy sessions read"), "one that starts at the session's start has nothing more to read");
});

test("an image a session was shown, or a tool gave back, is named by its media type", (t) => {
  const view = sessionView({
    items: [
      userItem("what is in this picture?", 1, [{ mimeType: "image/png" }]),
      toolItem("read", { status: "done", output: "shot.jpg", images: [{ mimeType: "image/jpeg" }], entry: 2 }),
    ],
  });
  const { lines } = start(t, onSession("scout", aSession("th_1"), view), { columns: 100 });

  const drawn = lines().join("\n");
  assert.ok(drawn.includes("image/png") && drawn.includes("image/jpeg"), drawn);
});

test("a trigger's own session is on the agent's list, which opens on it while it works, and takes no input", async (t) => {
  const nightly = aSession("trigger:nightly", { place: { kind: "trigger", trigger: "nightly" }, working: true });
  const disk = aThread("th_a", { preview: "check the disk", updatedAt: at(14, 5) });
  const list = aModel({
    where: { screen: "threads", place: { kind: "agent", name: "scout" } },
    listing: aListing([anAgent("scout"), aChatServer()]),
    agent: { state: "up" },
    dms: { scout: aDm("scout", [disk]) },
    sessions: [nightly],
  });
  const { terminal, state, lines } = start(t, list, { columns: 100 });
  const drawn = (): string => lines().join("\n");
  assert.ok(drawn().includes("check the disk") && drawn().includes("nightly"), "the trigger's session is a row beside the person's thread");

  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["watch trigger:nightly"], "the row that is working was the one chosen");
  state.show(onSession("scout", nightly, workingView([userItem("It is 02:00."), toolItem("bash", { args: { command: "df -h" } })], { kind: "tool", name: "bash" })));
  assert.match(drawn(), /df -h/);
  terminal.type("hello");
  terminal.type(ENTER);
  await settle();
  assert.doesNotMatch(drawn(), /hello/, "there is no editor to type in");
  assert.doesNotMatch(drawn(), /\/stop/, "and so no way to stop the work is offered");
  assert.deepEqual(state.calls, ["watch trigger:nightly"], "and nothing was sent");

  terminal.type(ESC);
  await until(() => state.calls.length === 2, "escape to be pressed");
  assert.equal(state.calls.at(-1), "back");
  state.show(list);
  terminal.type(ENTER);
  assert.equal(state.calls.at(-1), "watch trigger:nightly", "coming back to the list is not opening it again: the choice stayed where it was");
});

test("/devices lists the person's devices, and /devices take back ends a device's link", { timeout: 30_000 }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const rig = await startRig(t);
  const [address] = gateway.listening.listen;
  assert.ok(address);
  // A machine of the person's joins with an invitation, as `shrimpy invite` and `shrimpy join` make it, and links in with its token.
  const person = await gateway.connect();
  const roster = await person.host.get(Roster, {}, BACKGROUND_CONTEXT);
  stopAfter(t, () => roster.release());
  const invited = await roster.inviteDevice(BACKGROUND_CONTEXT);
  assert.ok(invited.kind === "done");
  const folder = tempDir(t, "machine");
  const { code, fingerprint } = invited.value;
  await joinAsMachine(folder, { name: null, address, code, fingerprint });
  const kept = readMachine(folder);
  assert.ok(kept !== undefined);
  const device = await connectGateway({ place: kept.gateway, token: kept.token });
  stopAfter(t, () => device.close());
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render(100)).join("\n");
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  rig.state.startThread();

  terminal.type("/devices");
  terminal.type(ENTER);
  await until(() => drawn().includes(hostname()), "the device to be listed by its label");
  terminal.type(`/devices take back ${hostname()}`);
  terminal.type(ENTER);

  await within(10_000, device.closed, "the device's link to end");
  await until(() => roster.ways.value.every((way) => way.kind !== "device"), "the roster to have no device");
});

/**
 * The terminal for a person with two agents, scout and mechanic, their own DM with scout, in which they started a thread,
 * and their own room, home, and what they are not in: the DM between the two agents and a room of them, lab, each with
 * something said in it. Scout joined first, so it is an admin and may make a room.
 */
async function amongOthers(t: TestContext) {
  const rig = await startRig(t, { agents: ["scout", "mechanic"] });
  const scout = await rig.member("scout");
  const mechanic = await rig.member("mechanic");
  const you = await rig.person();
  const mine = await rig.thread("scout", "check the disk");
  const homeRoom = await you.createRoom("home", [scout.id]);
  const asScout = await rig.asAgent("scout");
  const asMechanic = await rig.asAgent("mechanic");
  const dmChannel = await asScout.openDm(mechanic.id);
  const labRoom = await asScout.createRoom("lab", [mechanic.id]);
  const main = async (channelId: string) => {
    const found = (await you.threads(channelId)).find((each) => each.main);
    assert.ok(found);
    return found;
  };
  const home = { channel: homeRoom, thread: await main(homeRoom.id) };
  const dm = { channel: dmChannel, thread: await main(dmChannel.id) };
  const lab = { channel: labRoom, thread: await main(labRoom.id) };
  await asScout.post(dm.thread.id, "the backup finished");
  await asMechanic.post(dm.thread.id, "thanks, I checked it");
  await asMechanic.post(lab.thread.id, "the bench is free");
  await rig.until((model) => Object.keys(model.readOnly).length === 2, "the console to have read the channels the person is not in");
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const lines = (): string[] => visible(drawing.render(100));
  const drawn = (): string => lines().join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  const said = async (threadId: string): Promise<string[]> => (await you.read(threadId, null, 50)).map((message) => message.text);
  return { rig, you, asScout, mine, home, dm, lab, terminal, lines, drawn, seen, said };
}

test("the first screen marks a room the person only reads, and an agent's screen lists its DMs with other agents", { timeout: 30_000 }, async (t) => {
  const { rig, home, lab, terminal, lines, seen, said } = await amongOthers(t);
  await seen("#lab");
  const rowOf = (text: string): string => lines().find((line) => line.includes(text)) ?? "";
  const onlyRead = lines().filter((line) => line.includes(READ_ONLY_TAG));

  assert.equal(onlyRead.length, 1, "the room they are not in says so, and no row but it does: the DM between the agents is not on the screen");
  assert.ok(onlyRead[0]?.includes("#lab"));
  const idle = rowOf("#lab");
  const working = await rig.asAgent("mechanic");
  await working.setWorking(lab.thread.id, true);
  await until(() => rowOf("#lab") !== idle, "the room to say someone is working in it");
  await working.setWorking(lab.thread.id, false);

  terminal.type(DOWN);
  terminal.type(ENTER);
  await rig.until((model) => model.where.screen === "threads" && model.where.place.kind === "agent", "scout's screen");
  await seen("the backup finished");
  assert.ok(rowOf("check the disk") !== "" && !rowOf("check the disk").includes("mechanic"), "its thread with the person");
  assert.ok(rowOf("the backup finished").includes("mechanic"), "its DM with mechanic, which says who it is with");

  terminal.type(RIGHT);
  await until(() => rowOf("the backup finished") === "", "the screen to narrow to the person's threads");
  assert.ok(rowOf("check the disk") !== "");
  terminal.type(LEFT);
  await seen("the backup finished");

  // A thread of a room the person is in takes what they type, from here as from the room, and escape comes back here.
  rig.state.openThread(home.thread.id);
  await rig.until((model) => model.thread?.thread.id === home.thread.id, "the room's thread");
  terminal.type("is it fixed?");
  terminal.type(ENTER);
  await eventually(() => said(home.thread.id), (texts) => texts.includes("is it fixed?"), { what: "what was typed to be posted in the room" });
  terminal.type(ESC);
  assert.deepEqual(rig.state.model().where, { screen: "threads", place: { kind: "agent", name: "scout" } });

  // The other agent in that DM has it on its screen too.
  terminal.type(ESC);
  terminal.type(UP);
  terminal.type(ENTER);
  await rig.until((model) => model.where.screen === "threads" && model.where.place.kind === "agent" && model.where.place.name === "mechanic", "mechanic's screen");
  await seen("the backup finished");
  assert.ok(rowOf("the backup finished").includes("scout"));
});

test("a thread of a DM between two agents shows what both said, and takes no input", { timeout: 30_000 }, async (t) => {
  const { rig, mine, dm, terminal, drawn, seen, said } = await amongOthers(t);
  terminal.type(DOWN);
  terminal.type(ENTER);
  await rig.until((model) => model.where.screen === "threads" && model.where.place.kind === "agent", "scout's screen");
  await seen("the backup finished");

  rig.state.openThread(dm.thread.id);
  await rig.until((model) => model.thread?.messages.length === 2, "the DM's thread");

  assert.ok(drawn().includes("the backup finished") && drawn().includes("thanks, I checked it"), "what both said");
  const opened = screenOf(rig.state.model(), { now });
  assert.equal(opened.kind, "thread");
  const why = (opened as ThreadScreen).readOnly;
  assert.ok(why !== undefined && drawn().includes(why), "the line that says why nothing can be written is where the input would be");
  terminal.type("hello");
  terminal.type(ENTER);
  terminal.type(CTRL_N);
  await settle();
  assert.deepEqual(await said(dm.thread.id), ["the backup finished", "thanks, I checked it"], "nothing typed was sent");
  assert.doesNotMatch(drawn(), /hello|\/stop|rooms add/, "what is typed goes nowhere, and no way to stop the work or to join is offered");

  // Where the agent has no session behind the thread, Tab does nothing.
  rig.state.openThread(mine.id);
  await rig.until((model) => model.thread?.thread.id === mine.id, "the person's own thread");
  const where = rig.state.model().where;
  terminal.type(TAB);
  assert.deepEqual(rig.state.model().where, where);
});

test("a thread of a room the person only reads takes no input, and shows what is said as it comes", { timeout: 30_000 }, async (t) => {
  const { rig, you, asScout, lab, terminal, drawn, seen, said } = await amongOthers(t);
  const threadsIn = async (channelId: string): Promise<number> => (await you.threads(channelId)).length;

  rig.state.selectReadOnly(lab.channel.id);
  rig.state.openThread(lab.thread.id);
  await seen("the bench is free");
  assert.ok(drawn().includes(`shrimpy rooms add "#lab" ${you.me.name}`), "a room says how to join it");
  terminal.type("hello");
  terminal.type(ENTER);
  terminal.type(CTRL_N);
  terminal.type("/");
  await settle();
  await settle();
  assert.deepEqual(await said(lab.thread.id), ["the bench is free"], "nothing typed was sent");
  assert.equal(await threadsIn(lab.channel.id), 1, "and no thread was started");
  assert.deepEqual(rig.state.model().where, { screen: "thread", place: { kind: "read-only", id: lab.channel.id }, thread: lab.thread.id });
  assert.doesNotMatch(drawn(), /hello|\/stop|\/status/, "what is typed goes nowhere, and no list of commands opens");

  await asScout.post(lab.thread.id, "one more thing");
  await seen("one more thing");

  terminal.type(ESC);
  assert.equal(rig.state.model().where.screen, "threads", "escape goes back as everywhere");
  await asScout.setWorking(lab.thread.id, true);
  rig.state.openThread(lab.thread.id);
  await rig.until((model) => model.thread?.thread.id === lab.thread.id && model.thread.thread.working.length > 0, "the work to show");
  await settle();
  assert.doesNotMatch(drawn(), /\/stop/, "no way to stop the work is offered, which the person can't write");
  terminal.type("hello");
  terminal.type(ENTER);
  await settle();
  assert.deepEqual(await said(lab.thread.id), ["the bench is free", "one more thing"], "nothing typed here was sent either");
});

test("a room the person joins while reading it takes their input from then on", { timeout: 30_000 }, async (t) => {
  const { rig, you, lab, terminal, seen, said } = await amongOthers(t);
  rig.state.selectReadOnly(lab.channel.id);
  rig.state.openThread(lab.thread.id);
  await seen("the bench is free");

  await you.addMembers(lab.channel.id, [you.me.id]);
  await rig.until((model) => model.where.screen === "thread" && model.where.place.kind === "room", "the screen to become the room's");
  terminal.type("hello");
  terminal.type(ENTER);

  await eventually(() => said(lab.thread.id), (texts) => texts.includes("hello"), { what: "the message to be posted" });
});
