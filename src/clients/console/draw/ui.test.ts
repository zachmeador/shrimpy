import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setCapabilityOverrides, visibleWidth } from "@earendil-works/pi-tui";
import { assistantItem, sessionView, toolItem, userItem, workingView } from "../../../contracts/agent/testing/index.ts";
import { settle, stopAfter, until } from "../../../lib/testing/index.ts";
import { localTime } from "../../../lib/time/index.ts";
import { SHRIMPY_RELEASE_NAME } from "../../../lib/version/index.ts";
import { agentEntries, type Model } from "../state/index.ts";
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
  startRig,
  zach,
} from "../state/testing/index.ts";
import { QUIT_AGAIN, READ_ONLY_TAG, screenOf, type ThreadScreen } from "../screen/index.ts";
import { type Drawing, startDrawing } from "./index.ts";
import { FakeTerminal, visible } from "./testing/index.ts";

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

function start(t: TestContext, model: Model, size: { columns?: number; rows?: number; quitWindowMs?: number } = {}): Started {
  const state = fakeState(model);
  const terminal = new FakeTerminal(size.columns ?? 80, size.rows ?? 24);
  const drawing = startDrawing({ state, terminal, now: () => now, quitWindowMs: size.quitWindowMs ?? 60_000 });
  stopAfter(t, () => drawing.stop());
  return { state, terminal, drawing, lines: (width = terminal.columns) => visible(drawing.render(width)) };
}

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

const agentsModel = (): Model =>
  aModel({
    listing: aListing([anAgent("scout"), anAgent("mechanic"), aChatServer()]),
    dms: { scout: aDm("scout", [open]) },
  });

const threadsModel = (): Model =>
  aModel({
    where: { screen: "threads", place: { kind: "agent", name: "scout" } },
    listing: aListing([anAgent("scout"), aChatServer()]),
    dms: {
      scout: aDm("scout", [
        aThread("th_a", { preview: "Check the disk usage", updatedAt: at(14, 5), working: [{ memberId: scout.id, since: now }] }),
        aThread("th_b", { preview: "Remind me about the dentist", updatedAt: at(9, 2) }),
      ]),
    },
  });

test("the arrow keys move the choice, and enter opens it", (t) => {
  const { terminal, state } = start(t, agentsModel());

  terminal.type(DOWN);
  terminal.type(ENTER);

  assert.deepEqual(state.calls, ["select scout"]);
});

test("the choice stays where it was when the list is drawn again with something changed", (t) => {
  const { terminal, state } = start(t, agentsModel());
  terminal.type(DOWN);

  state.show({ ...agentsModel(), listing: aListing([anAgent("scout"), anAgent("mechanic"), anAgent("zed"), aChatServer()]) });
  terminal.type(ENTER);

  assert.deepEqual(state.calls, ["select scout"]);
});

test("in an agent's threads, enter opens one, control-n starts one and escape goes back", (t) => {
  const { terminal, state } = start(t, threadsModel());

  terminal.type(DOWN);
  terminal.type(ENTER);
  terminal.type(CTRL_N);
  terminal.type(ESC);

  assert.deepEqual(state.calls, ["open th_b", "start", "back"]);
});

test("with nothing to choose from, enter does nothing and control-n still starts a thread", (t) => {
  const { terminal, state } = start(t, aModel({ where: { screen: "threads", place: { kind: "agent", name: "scout" } } }));

  terminal.type(ENTER);
  terminal.type(CTRL_N);

  assert.deepEqual(state.calls, ["start"]);
});

test("a note is drawn by the editor at the bottom, so a long conversation does not push it out of sight", (t) => {
  const messages = Array.from({ length: 40 }, (_, index) => aMessage(`msg_${String(index + 1)}`, zach, `message ${String(index + 1)}`, { sentAt: at(14, 5) }));
  const long = onThread("scout", open, aThreadView(open, messages), { notice: { kind: "not-sent", problem: { said: "The disk is full." } } });
  const { lines } = start(t, long);

  assert.match(lines().slice(-6).join("\n"), /The disk is full/);
});

test("what is typed goes to the editor, enter sends it, and the editor is empty again", (t) => {
  const { terminal, state, lines } = start(t, conversation());

  terminal.type("hello");
  assert.match(lines().join("\n"), /\n hello\n/);
  terminal.type(ENTER);

  assert.deepEqual(state.calls, ["send hello"]);
  assert.doesNotMatch(lines().join("\n"), /\n hello\n/);
});

test("pressing enter on nothing sends nothing", (t) => {
  const { terminal, state } = start(t, conversation());

  terminal.type(ENTER);
  terminal.type("   ");
  terminal.type(ENTER);

  assert.deepEqual(state.calls, []);
});

test("a message that is not sent comes back to the editor to be sent again, ahead of anything typed since", async (t) => {
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

/** What a command in a DM's thread does, as the screen says it. */
function lineOf(name: string): string {
  const screen = screenOf(conversation(), { now });
  assert.equal(screen.kind, "thread");
  const found = (screen as ThreadScreen).commands.find((command) => command.name === name);
  assert.ok(found, `${name} is a command`);
  return found.line;
}

test("a slash lists the commands with what each does, more typing narrows the list, escape closes it without leaving the thread, and the next escape goes back", async (t) => {
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

test("enter acts on the command chosen in the list and tab only puts it in the editor, though tab turns a thread with a session behind it over: a command for agents is sent, and one for the terminal is not", async (t) => {
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

test("a text that starts with a slash is a command and never an ordinary message: one that is none is not posted and stays in the editor, and wrapped in backticks or after anything else it is posted", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  const drawn = (): string => lines().join("\n");

  terminal.type("/etc/hosts is wrong");
  await settle();
  assert.ok(!drawn().includes(lineOf("/stop")), "a text that is no command opens no list");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["note no-command"], "it is refused with a note, and nothing is posted");
  assert.match(drawn(), /\n \/etc\/hosts is wrong\n/, "and it is back in the editor to be corrected");

  terminal.type(CTRL_C);
  terminal.type("`/etc/hosts` is wrong");
  terminal.type(ENTER);
  terminal.type("@scout /stop");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["note no-command", "send `/etc/hosts` is wrong", "send @scout /stop"]);

  terminal.type("/status now");
  terminal.type(ENTER);
  assert.deepEqual(state.calls.slice(3), ["note takes-nothing"], "a command that takes nothing is not acted on with something after it");
});

test("/status shows the person what the agent is doing and its model, posts nothing, and goes when a message is sent or the thread is left", { timeout: 15_000 }, async (t) => {
  const rig = await startRig(t, { now: () => now });
  const thread = await rig.thread("scout", "go");
  rig.agents.scout?.agent.session(thread.id, {
    view: sessionView({
      items: [userItem("go"), assistantItem("Done.")],
      status: { model: { provider: "local", id: "big-model" }, usage: { input: 1204, output: 388, cost: 0.0231 } },
    }),
  });
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render(100)).join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  const posted = (): string[] => rig.chat.chat.messages(thread.id).map((message) => message.text);
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session !== undefined, "the session to be watched");

  terminal.type("/status");
  terminal.type(ENTER);
  await seen("big-model");
  assert.match(drawn(), /idle/, "what the agent is doing");
  assert.match(drawn(), /388/, "what the session has used");
  assert.ok(drawn().includes(localTime(now)), "when it was read");
  assert.deepEqual(posted(), ["go"], "nothing was posted");

  terminal.type("hello");
  terminal.type(ENTER);
  await until(() => !drawn().includes("big-model"), "the reading to go when a message is sent");
  assert.deepEqual(posted(), ["go", "hello"]);

  terminal.type("/status");
  terminal.type(ENTER);
  await seen("big-model");
  terminal.type(ESC);
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  rig.state.openThread(thread.id);
  await seen("hello");
  await settle();
  assert.ok(!drawn().includes("big-model"), "the reading is gone once the thread has been left");
});

const SMALL = { provider: "local", id: "small-model" };
const BIG = { provider: "local", id: "big-model" };
const TWO_MODELS = { models: [{ ...BIG, name: "Big Model" }, { ...SMALL, name: "Small Model" }], default: SMALL };

/** The terminal in a thread of scout's, which has a session using its default model, small-model, and can use that and big-model. */
async function onModels(t: TestContext) {
  const rig = await startRig(t, { now: () => now });
  const agent = rig.agents.scout?.agent;
  assert.ok(agent);
  agent.useModels(TWO_MODELS);
  const thread = await rig.thread("scout", "go");
  const session = agent.session(thread.id, {
    view: sessionView({ items: [userItem("go"), assistantItem("Done.")], status: { model: SMALL, usage: { input: 1204, output: 388, cost: 0.02 } } }),
  });
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render(100)).join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session !== undefined, "the session to be watched");
  return { rig, agent, session, terminal, drawn, seen, posted: (): string[] => rig.chat.chat.messages(thread.id).map((message) => message.text) };
}

test("/model and a space lists default and the models the agent can use, narrowed by typing, and choosing one posts the command as a message", { timeout: 15_000 }, async (t) => {
  const { agent, terminal, drawn, seen, posted } = await onModels(t);

  terminal.type("/model");
  await seen(lineOf("/model"));
  terminal.type(" ");
  await seen("local/big-model");
  assert.ok(drawn().includes("local/small-model"));
  assert.match(drawn(), /default.*local\/small-model/, "default says which model it is");
  assert.ok(drawn().indexOf("default") < drawn().indexOf("local/big-model"), "and comes first");
  terminal.type("big");
  await until(() => !drawn().includes("local/small-model"), "the list to narrow");
  terminal.type(ENTER);

  await until(() => posted().length === 2, "the command to be posted");
  assert.deepEqual(posted(), ["go", "/model local/big-model"], "it is a message, which the agent acts on");
  assert.equal(agent.modelListings, 1, "narrowing the list did not ask the agent again");
});

test("in a thread that is not started yet, /model alone says which model the agent starts it on, and choosing a model from the list posts the command, which starts the thread", { timeout: 15_000 }, async (t) => {
  const rig = await startRig(t, { now: () => now });
  const agent = rig.agents.scout?.agent;
  assert.ok(agent);
  agent.useModels(TWO_MODELS);
  await rig.dm("scout");
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render(100)).join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  terminal.type(CTRL_N);
  await seen("New thread with scout");
  await rig.until((model) => model.agent?.state === "up", "the agent to be reached");

  terminal.type("/model");
  terminal.type(ENTER);
  await seen("no session in this thread yet");
  assert.ok(drawn().includes("local/small-model"), "it says which model the agent's default is");
  terminal.type("/model big");
  await seen("local/big-model");
  terminal.type(ENTER);

  const started = await rig.until((model) => model.where.screen === "thread" && model.where.thread !== undefined, "the thread to start");
  const threadId = started.where.screen === "thread" ? started.where.thread : undefined;
  assert.ok(threadId);
  assert.deepEqual(rig.chat.chat.messages(threadId).map((message) => message.text), ["/model local/big-model"]);
});

test("/model alone says which model the thread uses and whether that is the agent's default, and posts nothing; /status says the same, and the agent's default too while the thread's is its own", { timeout: 15_000 }, async (t) => {
  const { rig, session, terminal, drawn, seen, posted } = await onModels(t);

  terminal.type("/model");
  terminal.type(ENTER);
  await seen("local/small-model");
  assert.doesNotMatch(drawn(), /local\/big-model/);

  // The agent gives the thread a model when it acts on `/model local/big-model`.
  session.update((view) => {
    view.status.model = BIG;
    view.status.ownModel = true;
  });
  await rig.until((model) => model.session?.status.model?.id === "big-model", "the thread to use big-model");
  terminal.type("/model");
  terminal.type(ENTER);
  await until(() => drawn().includes("local/big-model") && drawn().includes("local/small-model"), "the note to show both models");
  terminal.type("/status");
  terminal.type(ENTER);
  await until(() => drawn().includes("388") && drawn().includes("local/small-model") && drawn().includes("local/big-model"), "the reading to show the thread's model and the agent's default");
  assert.deepEqual(posted(), ["go"], "nothing was posted");
});

test("a model typed whole and followed by enter at once is the model chosen, whatever list the editor still has", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  state.answers.models = TWO_MODELS;
  const drawn = (): string => lines().join("\n");

  terminal.type("/model ");
  await until(() => drawn().includes("local/small-model"), "the list of models");
  terminal.type("local/big-model");
  terminal.type(ENTER);

  assert.deepEqual(state.calls, ["send /model local/big-model"], "the list still had default chosen, which no longer fit what was typed");
});

test("in a room /model is listed with the form to write it in, and written first it is not posted, while with an agent named before it, it is", async (t) => {
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
  assert.deepEqual(state.calls, ["note name-an-agent"], "written first, it mentions nobody, so it is not posted");
  assert.match(drawn(), /\n \/model local\/big-model\n/, "and the text stays in the editor");

  terminal.type(CTRL_C);
  terminal.type("/model");
  terminal.type(ENTER);
  terminal.type(CTRL_C);
  terminal.type("@scout /model local/big-model");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["note name-an-agent", "note name-an-agent", "send @scout /model local/big-model"]);
});

test("escape goes back from a thread while the agent is working there, and the work goes on", { timeout: 15_000 }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  const session = rig.agents.scout?.agent.session(thread.id, {
    view: workingView([userItem("go"), toolItem("bash", { args: { command: "ls" } })], { kind: "tool", name: "bash" }),
  });
  assert.ok(session);
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render(100)).join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  rig.state.openThread(thread.id);
  await seen("scout is working");
  assert.match(drawn(), /scout is working.*\/stop/, "the line that says the agent is working says how to stop it");
  assert.match(drawn(), /esc back/);

  terminal.type(ESC);
  terminal.type(ESC_RELEASED);
  await rig.until((model) => model.where.screen === "threads", "the agent's screen again");
  await settle();

  assert.ok(!drawn().includes(SHRIMPY_RELEASE_NAME), "a press is one press, whether or not the terminal reports the key being let go");
  assert.equal(session.stops, 0);
  assert.equal(session.view.status.busy, true, "the work goes on");
});

test("control-o shows a tool call in full and control-t the thinking in full, and each press again puts it back", (t) => {
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

test("what is typed for a thread is kept when another is opened, and is there when its thread is back", (t) => {
  const { terminal, state, lines } = start(t, conversation());
  const other = aThread("th_2", { preview: "Dentist" });

  terminal.type("a draft for the first");
  state.show(onThread("scout", other, aThreadView(other, [aMessage("msg_9", zach, "Dentist")])));
  assert.doesNotMatch(lines().join("\n"), /a draft/);
  terminal.type("one for the second");
  state.show(conversation());

  assert.match(lines().join("\n"), /\n a draft for the first\n/);
  assert.doesNotMatch(lines().join("\n"), /one for the second/);
  state.show(onThread("scout", other, aThreadView(other, [aMessage("msg_9", zach, "Dentist")])));
  assert.match(lines().join("\n"), /\n one for the second\n/);
});

test("a message that is sent leaves no draft behind to come back", (t) => {
  const { terminal, state, lines } = start(t, conversation());
  const other = aThread("th_2", { preview: "Dentist" });

  terminal.type("sent");
  terminal.type(ENTER);
  state.show(onThread("scout", other, aThreadView(other, [])));
  state.show(conversation());

  assert.doesNotMatch(lines().join("\n"), /sent/);
});

test("control-c clears what is typed, and a second press quits; it never quits at once", async (t) => {
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

test("control-c on an empty editor waits for a second press, and any other key starts again", async (t) => {
  const { terminal, drawing, lines } = start(t, conversation());
  let left = false;
  void drawing.left.then(() => {
    left = true;
  });

  terminal.type(CTRL_C);
  assert.equal(lines().at(-1), QUIT_AGAIN);
  terminal.type("x");
  assert.notEqual(lines().at(-1), QUIT_AGAIN);
  terminal.type(CTRL_C);
  await settle();
  assert.equal(left, false, "text was typed in between, so this cleared it");
  terminal.type(CTRL_C);
  await settle();

  assert.equal(left, true);
});

test("a second control-c that comes too late is a first one", async (t) => {
  const { terminal, drawing, lines } = start(t, conversation(), { quitWindowMs: 30 });
  let left = false;
  void drawing.left.then(() => {
    left = true;
  });

  terminal.type(CTRL_C);
  await until(() => lines().at(-1) !== QUIT_AGAIN, "the wait to end");
  terminal.type(CTRL_C);
  await settle();

  assert.equal(left, false);
  assert.equal(lines().at(-1), QUIT_AGAIN);
});

test("leaving can be asked for from outside, and the terminal is given back", async (t) => {
  const { terminal, drawing } = start(t, agentsModel());

  drawing.leave();
  await drawing.left;
  await drawing.stop();
  await drawing.stop();

  assert.equal(terminal.started, true);
  assert.equal(terminal.stopped, true);
});

test("the work is drawn apart from what was said, with the agent working below it", (t) => {
  const model = onThread("scout", aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] }), aThreadView(open, [aMessage("msg_1", zach, "go", { sentAt: at(14, 5) })]), {
    session: workingView(
      [
        userItem("..."),
        assistantItem("Let me look.", { thinking: "List the files first.", stopReason: "toolUse" }),
        toolItem("bash", { args: { command: "ls" }, status: "done", output: "a\nb\n" }),
        assistantItem("Two files: **a** and b", { streaming: true }),
      ],
      { kind: "answering" },
    ),
  });
  const { lines } = start(t, model);

  const shown = lines();
  const said = shown.indexOf("  go");
  const first = shown.findIndex((line) => line.startsWith("│ "));
  const last = shown.findLastIndex((line) => line.startsWith("│ "));
  const working = shown.findIndex((line) => line.includes("scout is working"));

  assert.ok(said >= 0 && said < first, "the work is below what was said");
  assert.ok(shown.slice(first, last + 1).every((line) => line.startsWith("│ ")), "the work is one block, with a bar down its side");
  assert.ok(last < working, "the line saying the agent is working is below the work");
  assert.ok(shown.slice(first, last + 1).some((line) => line.includes("Two files: a and b")), "the answer so far is in the work");
});

test("when the work ends the work and the working line go away", async (t) => {
  const busy = onThread("scout", aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] }), undefined, {
    session: workingView([userItem("go"), toolItem("bash", { status: "running" })]),
  });
  const { state, lines } = start(t, busy);
  assert.ok(lines().some((line) => line.startsWith("│ ")));

  state.show(onThread("scout", open, undefined));

  assert.equal(lines().some((line) => line.startsWith("│ ") || line.includes("working")), false);
});

test("leaving a thread whose agent is working stops its spinner, so a list does not redraw for nothing", async (t) => {
  const busy = onThread("scout", aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] }), undefined);
  const { state, terminal } = start(t, busy);
  await until(() => terminal.output().includes("scout is working"), "the working line to be drawn");

  state.show(threadsModel());
  await until(() => terminal.output().includes("Check the disk usage"), "the threads to be drawn");
  await settle();
  const drawn = terminal.hides;
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(terminal.hides, drawn, "nothing is drawn again while nothing changes");
});

test("a long run of work shows its latest lines and says how many came before, whatever the width", (t) => {
  const output = Array.from({ length: 6 }, (_, index) => `line ${String(index)}`).join("\n");
  const items = [userItem("go"), ...Array.from({ length: 12 }, (_, index) => toolItem("bash", { id: `c${String(index)}`, args: { command: `echo ${String(index)}` }, status: "done", output }))];
  const model = onThread("scout", aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] }), undefined, { session: workingView(items) });
  const { lines } = start(t, model, { rows: 24 });

  const work = lines().filter((line) => line.startsWith("│ "));

  assert.equal(work.length, 12, "half of a 24-row terminal");
  assert.match(work[0] ?? "", /^│ \d+ earlier lines$/);
  assert.equal(work.at(-1), "│   line 5");
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
      session: workingView(
        [
          userItem(`shown${hostile}`),
          assistantItem(`answer${hostile}`, { thinking: `thinking${hostile}`, streaming: true }),
          toolItem(`tool${hostile}`, { args: { command: `echo ${hostile}` }, output: `output${hostile}`, notes: [`note${hostile}`] }),
        ],
        { kind: "tool", name: `tool${hostile}` },
      ),
      notice: { kind: "not-sent", problem: { said: `said${hostile}` } },
    },
  );
  model.session?.status.queued.push({ mode: "steer", text: `queued${hostile}` });
  const { terminal, drawing, state } = start(t, model);

  const drawn = [...drawing.render(80)];
  state.show({ ...model, where: { screen: "threads", place: { kind: "agent", name: "scout" } } });
  drawn.push(...drawing.render(80));
  const sessions = [aSession("th_9", { place: { kind: "dm", with: { name: `mechanic${hostile}`, kind: "agent" }, thread: { main: false, name: `thread${hostile}` } } })];
  state.show({ ...model, where: { screen: "threads", place: { kind: "agent", name: "scout" } }, sessions });
  drawn.push(...drawing.render(80));
  state.show({ ...model, where: { screen: "session", agent: "scout", session: "th_9" }, sessions, refusal: `refused${hostile}` });
  drawn.push(...drawing.render(80));
  state.show({ ...model, where: { screen: "thread", place: { kind: "agent", name: "scout" }, thread: "th_1", turned: true }, sessions });
  drawn.push(...drawing.render(80));
  state.show({ ...model, where: { screen: "agents" } });
  drawn.push(...drawing.render(80));
  await until(() => terminal.output().includes(SHRIMPY_RELEASE_NAME), "the terminal to be written");

  // Styles are the console's own. Once those and the cursor are taken out, nothing but text is left.
  const own = new RegExp("\\u001b\\[[0-9;:]*m|\\u001b_pi:c\\u0007", "g");
  const text = drawn.join("\n").replace(own, "");
  assert.doesNotMatch(text, new RegExp("[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f]"));
  for (const wanted of ["Evil", "text", "detail", "reply", "\u{1F44D}", "answer", "thinking", "output", "note", "said", "shown", "queued", "mechanic", "thread", "refused"]) {
    assert.ok(text.includes(wanted), wanted);
  }
  const written = terminal.output();
  for (const payload of ["pwned", "999;999H", "cHduZWQ", "]52;", "]0;"]) assert.ok(!written.includes(payload), `${payload} reached the terminal`);
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

test("the editor's draft survives the chat server being lost and found, and the agent too", (t) => {
  const { terminal, state, lines } = start(t, conversation());
  terminal.type("half a thought");

  state.show({ ...conversation(), chat: { state: "down", why: { kind: "lost" } }, agent: { state: "down", why: { kind: "lost" } } });
  assert.match(lines().join("\n"), /\n half a thought\n/);
  assert.match(lines().join("\n"), /\nLost the connection to the chat server\. What is shown may be out of date/);
  assert.equal(lines()[0], "scout · Check the disk usage", "the title, which a long conversation scrolls away, does not change");
  state.show(conversation());

  assert.match(lines().join("\n"), /\n half a thought\n/);
  assert.doesNotMatch(lines().join("\n"), /out of date/);
});

test("a trigger's own session is on the agent's list, which opens on it while it works, and it opens as the agent's view of it, with nothing to type", { timeout: 15_000 }, async (t) => {
  const rig = await startRig(t);
  await rig.thread("scout", "check the disk");
  const nightly = rig.agents.scout?.agent.session("trigger:nightly", {
    place: { kind: "trigger", trigger: "nightly" },
    view: workingView([userItem("It is 02:00."), toolItem("bash", { args: { command: "df -h" } })], { kind: "tool", name: "bash" }),
  });
  assert.ok(nightly);
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render(100)).join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);

  await rig.until((model) => model.sessions?.length === 1, "scout to have said which sessions it has");
  assert.ok(drawn().includes("check the disk") && drawn().includes("nightly"), "the trigger's session is a row beside the person's thread");
  terminal.type(ENTER);
  await seen("df -h");
  assert.deepEqual(rig.state.model().where, { screen: "session", agent: "scout", session: "trigger:nightly" }, "the row that is working was the one chosen");
  nightly.update((view) => {
    view.items.push(assistantItem("The disk is 43% full.", { streaming: true }));
  });
  await seen("The disk is 43% full.");

  terminal.type("hello");
  terminal.type(ENTER);
  await settle();
  assert.doesNotMatch(drawn(), /hello/, "there is no editor to type in");
  assert.doesNotMatch(drawn(), /\/stop/, "and so no way to stop the work is offered");
  assert.deepEqual(nightly.steers, []);
  assert.equal(rig.chat.chat.messages().length, 1, "only the message the thread began with was ever posted");

  terminal.type(ESC);
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  assert.ok(drawn().includes("check the disk") && drawn().includes("nightly"));
  assert.equal(nightly.stops, 0, "going back stops nothing");
  terminal.type(ENTER);
  assert.equal(rig.state.model().where.screen, "session", "coming back to the list is not opening it again: the choice stayed where it was");
});

test("the list of agents shows an agent as working when any of its sessions is, where when that is one place that is not with the person and how many when it is several, and as idle when the work ends", { timeout: 15_000 }, async (t) => {
  const rig = await startRig(t, { agents: ["scout", "mechanic"] });
  const yours = await rig.thread("mechanic", "check the disk");
  const sessions = rig.agents.scout?.agent;
  assert.ok(sessions);
  // Scout's DM with mechanic is none of the person's threads, and it is working in it.
  const private_ = sessions.session("th_private", {
    place: { kind: "dm", with: { name: "mechanic", kind: "agent" }, thread: { main: true, name: null } },
    view: workingView([userItem("ping")]),
  });
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const rowOf = (agent: string): string => visible(drawing.render(100)).find((line) => line.slice(2).startsWith(agent)) ?? "";
  const entryOf = (agent: string) => agentEntries(rig.state.model()).find((entry) => entry.name === agent);

  await until(() => rowOf("scout").includes("mechanic"), "scout's row to say where it is working");
  assert.equal(entryOf("scout")?.working, true);
  assert.equal(entryOf("mechanic")?.working, false);
  assert.ok(!rowOf("mechanic").includes("scout"));

  // Working in a thread of the person's reads as it always did: working, and nowhere else.
  await (await rig.asAgent("mechanic")).chat.setWorking(yours.id, true);
  await rig.until((model) => agentEntries(model).find((entry) => entry.name === "mechanic")?.working === true, "mechanic to be working");
  assert.deepEqual(entryOf("mechanic")?.elsewhere, []);
  assert.ok(!rowOf("mechanic").includes("scout"));

  // In two places at once, the row says how many and no longer where.
  const nightly = sessions.session("trigger:nightly", {
    place: { kind: "trigger", trigger: "nightly" },
    view: workingView([userItem("It is 02:00.")]),
  });
  await until(() => rowOf("scout").includes("2"), "scout's row to say how many sessions it is working in");
  assert.ok(!rowOf("scout").includes("mechanic"));

  const done = sessionView({ items: [userItem("ping"), assistantItem("pong")] });
  private_.show(done);
  nightly.show(done);
  await rig.until((model) => agentEntries(model).find((entry) => entry.name === "scout")?.working === false, "scout's work to end");
  assert.ok(!rowOf("scout").includes("mechanic"));
});

/**
 * The terminal for a person with two agents, scout and mechanic, their own DM with scout, in which they started a thread,
 * and their own room, home, and what they are not in: the DM between the two agents and a room of them, lab, each with
 * something said in it.
 */
async function amongOthers(t: TestContext) {
  const rig = await startRig(t, { agents: ["scout", "mechanic"] });
  const scout = await rig.member("scout");
  const mechanic = await rig.member("mechanic");
  const person = (await rig.person()).me;
  const mine = await rig.thread("scout", "check the disk");
  const home = rig.chat.chat.room("home", [person, scout]);
  const dm = rig.chat.chat.dm(scout, mechanic);
  const lab = rig.chat.chat.room("lab", [scout, mechanic]);
  rig.chat.chat.say(scout, dm.thread.id, "the backup finished");
  rig.chat.chat.say(mechanic, dm.thread.id, "thanks, I checked it");
  rig.chat.chat.say(mechanic, lab.thread.id, "the bench is free");
  await rig.until((model) => Object.keys(model.readOnly).length === 2, "the console to have read the channels the person is not in");
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const lines = (): string[] => visible(drawing.render(100));
  const drawn = (): string => lines().join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  return { rig, person, scout, mechanic, mine, home, dm, lab, terminal, lines, drawn, seen };
}

test("the first screen has a room the person only reads and no DM between agents, which is on the screen of each of the two with their threads with the person, and Right narrows that screen to the person's threads and Left widens it again", { timeout: 15_000 }, async (t) => {
  const { rig, person, home, lab, terminal, lines, seen } = await amongOthers(t);
  // Scout has a session of its own in each of the rooms: lab, which the person only reads, and home, which they are in.
  rig.chat.chat.say(person, home.thread.id, "the porch light is out");
  rig.agents.scout?.agent.session(lab.thread.id, { place: { kind: "room", room: "lab", thread: { main: true, name: null } } });
  rig.agents.scout?.agent.session(home.thread.id, { place: { kind: "room", room: "home", thread: { main: true, name: null } } });
  await seen("#lab");
  const rowOf = (text: string): string => lines().find((line) => line.includes(text)) ?? "";
  const onlyRead = lines().filter((line) => line.includes(READ_ONLY_TAG));

  assert.equal(onlyRead.length, 1, "the room they are not in says so, and no row but it does: the DM between the agents is not on the screen");
  assert.ok(onlyRead[0]?.includes("#lab"));
  const working = await rig.asAgent("mechanic");
  await working.chat.setWorking(lab.thread.id, true);
  await until(() => rowOf("#lab").includes("working"), "the room to say someone is working in it");
  await working.chat.setWorking(lab.thread.id, false);

  terminal.type(DOWN);
  terminal.type(ENTER);
  await rig.until((model) => model.where.screen === "threads" && model.sessions?.length === 2, "scout's screen");
  assert.ok(rowOf("check the disk") !== "" && !rowOf("check the disk").includes("mechanic"), "its thread with the person");
  assert.ok(rowOf("the backup finished").includes("mechanic"), "its DM with mechanic, which says who it is with");
  assert.ok(rowOf("the bench is free").includes("#lab"), "and the rooms it has a session in, which say where");

  terminal.type(RIGHT);
  await until(() => rowOf("the backup finished") === "", "the screen to narrow to the person's threads");
  assert.ok(rowOf("check the disk") !== "");
  assert.equal(rowOf("the bench is free"), "");
  terminal.type(LEFT);
  await seen("the backup finished");
  assert.ok(rowOf("check the disk") !== "" && rowOf("the bench is free") !== "");

  // A thread of a room the person is in takes what they type, from here as from the room, and escape comes back here.
  rig.state.openThread(home.thread.id);
  await rig.until((model) => model.thread?.messages.length === 1, "the room's thread");
  terminal.type("is it fixed?");
  terminal.type(ENTER);
  await until(() => rig.chat.chat.messages(home.thread.id).some((message) => message.text === "is it fixed?"), "what was typed to be posted in the room");
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

test("a thread of an agent's DM with another agent opens with what both said and the agent's work beside it, takes no input, and tab turns it over to the agent's view and back, which escape leaves for the agent's screen from either side", { timeout: 15_000 }, async (t) => {
  const { rig, mine, dm, terminal, drawn, seen } = await amongOthers(t);
  const session = rig.agents.scout?.agent.session(dm.thread.id, {
    place: { kind: "dm", with: { name: "mechanic", kind: "agent" }, thread: { main: true, name: null } },
    view: workingView(
      [
        userItem("mechanic wrote that it is done"),
        assistantItem("Checking.", { thinking: "Is the backup whole?", stopReason: "toolUse" }),
        toolItem("bash", { args: { command: "ls backups" } }),
      ],
      { kind: "tool", name: "bash" },
    ),
  });
  assert.ok(session);
  const before = rig.chat.chat.messages().length;
  const scoutsScreen = { screen: "threads", place: { kind: "agent", name: "scout" } };

  terminal.type(DOWN);
  terminal.type(ENTER);
  await rig.until((model) => model.where.screen === "threads" && model.sessions?.length === 1, "scout's screen");
  terminal.type(ENTER);
  await rig.until((model) => model.thread?.messages.length === 2 && model.session !== undefined, "the DM's thread and the work behind it");

  assert.ok(drawn().includes("the backup finished") && drawn().includes("thanks, I checked it"), "what both said");
  assert.ok(drawn().includes("ls backups") && drawn().includes("scout is working"), "and the work beside it");
  const open = screenOf(rig.state.model(), { now });
  assert.equal(open.kind, "thread");
  const why = (open as ThreadScreen).readOnly;
  assert.ok(why !== undefined && drawn().includes(why), "the line that says why nothing can be written is where the input would be");
  terminal.type("hello");
  terminal.type(ENTER);
  terminal.type(CTRL_N);
  await settle();
  assert.equal(rig.chat.chat.messages().length, before, "nothing typed was sent");
  assert.doesNotMatch(drawn(), /hello|\/stop|rooms add/, "what is typed goes nowhere, and no way to stop the work or to join is offered");

  terminal.type(TAB);
  await seen("mechanic wrote that it is done");
  assert.ok(drawn().includes("Is the backup whole?") && drawn().includes("ls backups"), "the session as scout sees it has its thinking and its tool calls");
  assert.ok(!drawn().includes("thanks, I checked it"), "and not the conversation");
  terminal.type(TAB);
  await seen("thanks, I checked it");
  assert.ok(!drawn().includes("mechanic wrote that it is done"));

  terminal.type(ESC);
  assert.deepEqual(rig.state.model().where, scoutsScreen, "escape from the conversation goes to the agent's screen");
  terminal.type(ENTER);
  await rig.until((model) => model.thread?.messages.length === 2 && model.session !== undefined, "the DM's thread and the work behind it again");
  terminal.type(TAB);
  await seen("mechanic wrote that it is done");
  terminal.type(ESC);
  assert.deepEqual(rig.state.model().where, scoutsScreen, "and so does escape from the agent's view");

  // Where the agent has no session behind the thread, tab does nothing and no hint names it.
  rig.state.openThread(mine.id);
  await rig.until((model) => model.thread?.messages.length === 1 && model.session === undefined, "the person's own thread, which scout has no session behind");
  assert.ok(screenOf(rig.state.model(), { now }).keys.every((hint) => !hint.startsWith("tab")));
  const where = rig.state.model().where;
  terminal.type(TAB);
  assert.deepEqual(rig.state.model().where, where);
});

test("in a thread of a room the person only reads nothing typed is sent and no thread is started, the line where the input would be says why, and what is said there shows as it comes", { timeout: 15_000 }, async (t) => {
  const { rig, person, scout, lab, terminal, drawn, seen } = await amongOthers(t);
  const said = (): number => rig.chat.chat.messages().length;
  const threadsIn = async (channelId: string): Promise<number> => (await (await rig.person()).chat.threads(channelId)).length;
  const before = said();

  rig.state.selectReadOnly(lab.channel.id);
  rig.state.openThread(lab.thread.id);
  await seen("the bench is free");
  assert.ok(drawn().includes(`shrimpy rooms add "#lab" ${person.name}`), "a room says how to join it");
  terminal.type("hello");
  terminal.type(ENTER);
  terminal.type(CTRL_N);
  terminal.type("/");
  await settle();
  await settle();
  assert.equal(said(), before, "nothing typed was sent");
  assert.equal(await threadsIn(lab.channel.id), 1, "and no thread was started");
  assert.deepEqual(rig.state.model().where, { screen: "thread", place: { kind: "read-only", id: lab.channel.id }, thread: lab.thread.id });
  assert.doesNotMatch(drawn(), /hello|\/stop|\/status/, "what is typed goes nowhere, and no list of commands opens");
  assert.doesNotMatch(drawn(), /enter send|ctrl\+n/, "and the keys do not offer what does nothing");

  rig.chat.chat.say(scout, lab.thread.id, "one more thing");
  await seen("one more thing");

  terminal.type(ESC);
  assert.equal(rig.state.model().where.screen, "threads", "escape goes back as everywhere");
  await (await rig.asAgent("scout")).chat.setWorking(lab.thread.id, true);
  rig.state.openThread(lab.thread.id);
  await seen("scout is working");
  assert.doesNotMatch(drawn(), /\/stop/, "no way to stop the work is offered, which the person can't write");
  terminal.type("hello");
  terminal.type(ENTER);
  await settle();
  assert.equal(said(), before + 1, "nothing typed here was sent either; only the message above was said");
});

test("a room the person joins while reading it is theirs from then on, with the input there", { timeout: 15_000 }, async (t) => {
  const { rig, person, lab, terminal, seen } = await amongOthers(t);
  rig.state.selectReadOnly(lab.channel.id);
  rig.state.openThread(lab.thread.id);
  await seen("the bench is free");

  await (await rig.person()).chat.addMembers(lab.channel.id, [person.id]);
  await rig.until((model) => model.where.screen === "thread" && model.where.place.kind === "room", "the screen to become the room's");
  terminal.type("hello");
  terminal.type(ENTER);

  await until(() => rig.chat.chat.messages(lab.thread.id).some((message) => message.text === "hello"), "the message to be posted");
});
