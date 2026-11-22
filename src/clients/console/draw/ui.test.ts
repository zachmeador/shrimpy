import assert from "node:assert/strict";
import { hostname } from "node:os";
import { test, type TestContext } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { setCapabilityOverrides, stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { assistantItem, toolItem, userItem } from "../../../contracts/agent/testing/index.ts";
import { Roster } from "../../../contracts/gateway/index.ts";
import { connectClient, newToken, sayHello } from "../../../contracts/gateway/node.ts";
import { startTestGateway } from "../../../contracts/gateway/testing/index.ts";
import { eventually, FakeTerminal, stopAfter, until, within } from "../../../lib/testing/index.ts";
import { localTime } from "../../../lib/time/index.ts";
import { SHRIMPY_RELEASE_NAME } from "../../../lib/version/index.ts";
import type { Model, Notice, Place, Status } from "../../state/index.ts";
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
} from "../../state/testing/index.ts";
import { READ_ONLY_TAG, threadLevel, versionLine } from "../../view/index.ts";
import { type Drawing, type Screen, startDrawing } from "./index.ts";
import { ALL_KEYS, CLOSE_KEYS, KEYS_TITLE, QUIT_AGAIN, SELF, turnHint } from "./words.ts";

/** Lines of the screen as a person reads them: without styles, and without the spaces that pad them. */
const visible = (lines: string[]): string[] => lines.map((line) => stripTerminalSequences(line).trimEnd());

const scout = agentMember("scout");
const mechanic = agentMember("mechanic");
const at = (hour: number, minute: number): number => new Date(2026, 9, 3, hour, minute).getTime();
const now = at(15, 0);

const UP = "\u001b[A";
const DOWN = "\u001b[B";
const LEFT = "\u001b[D";
const RIGHT = "\u001b[C";
const ENTER = "\r";
const BACKSPACE = "\u007f";
const ESC = "\u001b";
/** What a terminal that reports keys being let go sends when Left is, and when Esc is. */
const LEFT_RELEASED = "\u001b[1;1:3D";
const ESC_RELEASED = "\u001b[27;1:3u";
const TAB = "\t";
const CTRL_C = "\u0003";
const CTRL_G = "\u0007";
const CTRL_N = "\u000e";
const CTRL_O = "\u000f";
const CTRL_T = "\u0014";
const CTRL_BACKSLASH = "\u001c";
/** A press and a release of the mouse's first button at a cell, a column and a row from 0, as a terminal reports them. */
const click = (column: number, row: number): string[] => [`\u001b[<0;${String(column + 1)};${String(row + 1)}M`, `\u001b[<0;${String(column + 1)};${String(row + 1)}m`];

interface Started {
  state: FakeState;
  terminal: FakeTerminal;
  drawing: Drawing;
  /** What the person sees now. */
  lines: () => string[];
  /** All of it as one string. */
  drawn: () => string;
  /** The level in front as it was drawn last. */
  screen: () => Screen | undefined;
}

function start(t: TestContext, model: Model, size: { columns?: number; rows?: number } = {}): Started {
  const state = fakeState(model);
  const terminal = new FakeTerminal(size.columns ?? 80, size.rows ?? 24);
  let drawn: Screen | undefined;
  const drawing = startDrawing({ state, terminal, now: () => now, quitWindowMs: 60_000, onDraw: (screen) => void (drawn = screen) });
  stopAfter(t, () => drawing.stop());
  const lines = (): string[] => visible(drawing.render());
  return { state, terminal, drawing, lines, drawn: () => lines().join("\n"), screen: () => drawn };
}

/** What was posted, of everything the drawing asked of the state. */
const sent = (state: FakeState): string[] => state.calls.filter((call) => call.startsWith("send "));

/** Whether a line of the level furthest right holds `text` and nothing else. */
const shows = (lines: string[], text: string): boolean => lines.some((line) => line.split("│").at(-1)?.trim() === text);

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

/** What a command in a thread does, as the views say it there. */
function lineOf(name: string, model: Model = conversation()): string {
  const found = threadLevel(model, { now, self: SELF })?.commands.find((command) => command.name === name);
  assert.ok(found, `${name} is a command`);
  return found.line;
}

/** Scout's list, with the person's two threads with it, the newer first, and nothing open in it. */
const second = aThread("th_2", { preview: "Rotate the logs", updatedAt: at(14, 30) });
const scoutsList = (parts: Partial<Model> = {}): Model =>
  aModel({
    open: { list: { kind: "agent", id: scout.id }, item: undefined },
    listing: aListing([anAgent("scout"), aChatServer()]),
    agent: { state: "up" },
    dms: { [scout.id]: aDm("scout", [second, open]) },
    ...parts,
  });
/** That list with a thread open in it. */
const inThread = (threadId: string, parts: Partial<Model> = {}): Model => {
  const dm = { kind: "agent" as const, id: scout.id };
  return scoutsList({ open: { list: dm, item: { kind: "thread", place: dm, thread: threadId, side: undefined } }, ...parts });
};

test("Right and Enter open what is chosen, a level at a time, and Left goes back", (t) => {
  const first = aModel({ listing: aListing([anAgent("scout"), aChatServer()]), dms: { [scout.id]: aDm("scout", [second, open]) } });
  const { terminal, state, screen } = start(t, first);
  assert.equal(screen()?.kind, "agents");

  terminal.type(RIGHT);
  assert.deepEqual(state.calls, [`select ${scout.id}`], "right opens the agent chosen");
  state.show(scoutsList());
  assert.equal(screen()?.kind, "threads");
  terminal.type(DOWN);
  terminal.type(ENTER);
  assert.deepEqual(state.calls.at(-1), "open th_1", "enter opens a row as right does, here the second");
  state.show(inThread("th_1"));
  assert.equal(screen()?.kind, "thread");

  terminal.type(LEFT);
  terminal.type(LEFT_RELEASED);
  assert.equal(screen()?.kind, "threads", "left goes back a level, once for one press");
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "agents");
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "agents", "and goes no further than the first");
  terminal.type(RIGHT);
  assert.equal(screen()?.kind, "threads", "the list opened is the one that was open, with what was open in it");
  terminal.type(RIGHT);
  assert.equal(state.calls.at(-1), "open th_1", "and the row chosen is the one that was open");
});

test("Left moves through what is typed in a thread before it goes back, and what was typed stays with its thread", (t) => {
  const { terminal, state, lines, screen } = start(t, inThread("th_1"));
  terminal.type("hi");
  terminal.type(LEFT);
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "thread", "left crossed what was typed");
  terminal.type("oh ");
  assert.ok(shows(lines(), "oh hi"), "up to its start");
  for (const _ of "oh ") terminal.type(LEFT);
  assert.equal(screen()?.kind, "thread");
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "threads", "from its start, left goes back");

  // Another thread has its own input, and coming back to this one finds what was typed in it.
  state.show(inThread("th_2"));
  assert.equal(screen()?.kind, "thread");
  assert.ok(!lines().some((line) => line.includes("oh hi")), "the other thread's input is empty");
  terminal.type("for the other");
  state.show(inThread("th_1"));
  assert.ok(shows(lines(), "oh hi"), "the first thread's draft is back");
  state.show(inThread("th_2"));
  assert.ok(shows(lines(), "for the other"));
  assert.deepEqual(sent(state), [], "and nothing was sent");
});

test("Esc goes back from a thread whatever is typed, and what was typed is there when the thread is opened again", (t) => {
  const { terminal, state, lines, screen } = start(t, inThread("th_1"));
  terminal.type("half a line");
  terminal.type(LEFT);
  terminal.type(ESC);
  assert.equal(screen()?.kind, "threads", "esc went back with the cursor in the middle of what was typed");

  state.show(inThread("th_2"));
  assert.ok(!lines().some((line) => line.includes("half a line")), "another thread's input is empty");
  state.show(inThread("th_1"));
  assert.ok(shows(lines(), "half a line"), "and the first thread's is as it was left");
  terminal.type(ESC);
  terminal.type(ESC);
  assert.equal(screen()?.kind, "agents", "from a list, esc goes back to the agents and rooms");
  assert.deepEqual(sent(state), [], "and nothing was sent");
});

test("Tab is the other view of where you are: everything or yours on an agent's list, and in a thread each agent's view in turn", (t) => {
  const rooms = { ch_2: aRoom("ops", ["scout", "mechanic"], [aThread("th_9", { preview: "the bench", channelId: "ch_2" })]) };
  const elsewhere = aSession("th_9", { place: { kind: "room", room: "ops", thread: { main: false, name: "the bench" } } });
  const { terminal, state, lines, screen } = start(t, scoutsList({ rooms, sessions: [elsewhere] }), { columns: 100 });
  const drawn = (): string => lines().join("\n");
  assert.ok(drawn().includes("the bench"), "everything the agent takes part in");
  terminal.type(TAB);
  assert.ok(!drawn().includes("the bench") && drawn().includes("Rotate the logs"), "only the person's threads with it");
  terminal.type(TAB);
  assert.ok(drawn().includes("the bench"), "and everything again");

  // In a thread of the room, Tab puts each agent's view of the session behind it on show in turn, and the conversation back.
  const room = { kind: "room" as const, id: "ch_2" };
  const behind = { [scout.id]: sessionView({ items: [userItem("scout was shown this")] }), [mechanic.id]: sessionView({ items: [userItem("mechanic was shown this")] }) };
  const listing = aListing([anAgent("scout"), anAgent("mechanic"), aChatServer()]);
  const side = (agent: string | undefined): Model =>
    aModel({ listing, rooms, behind, agent: { state: "up" }, open: { list: room, item: { kind: "thread", place: room, thread: "th_9", side: agent } } });
  const tabSays = (at: number): string => turnHint(2, at).join(" ");
  state.show(side(undefined));
  assert.equal(screen()?.kind, "thread");
  assert.ok(drawn().includes(tabSays(0)), drawn());
  terminal.type(TAB);
  assert.equal(state.calls.at(-1), "turn over");
  state.show(side(mechanic.id));
  assert.ok(drawn().includes("mechanic was shown this") && drawn().includes(tabSays(1)), drawn());
  terminal.type(TAB);
  state.show(side(scout.id));
  assert.ok(drawn().includes("scout was shown this") && drawn().includes(tabSays(2)), drawn());
  assert.ok(lines().some((line) => line.includes("─") && !line.includes("scout")), "the input stays under the agent's view");
  terminal.type("a word");
  assert.ok(shows(lines(), "a word"));
  terminal.type(TAB);
  state.show(side(undefined));
  assert.ok(drawn().includes(tabSays(0)));
  assert.deepEqual(state.calls.filter((call) => call === "turn over").length, 3);
});

test("the levels stand side by side as the width allows, and Ctrl+\\ puts them back to one at a time and back", (t) => {
  const model = inThread("th_1", { thread: aThreadView(open, [aMessage("msg_1", scout, "the disk is fine", { sentAt: at(14, 6) })]) });
  const { terminal, lines, screen } = start(t, model);
  const onShow = (): { agents: boolean; list: boolean; thread: boolean } => {
    const drawn = lines().join("\n");
    return { agents: drawn.includes(versionLine()[1]), list: drawn.includes("Rotate the logs"), thread: drawn.includes("the disk is fine") };
  };
  const sized = (columns: number): void => {
    terminal.columns = columns;
    lines();
  };

  assert.deepEqual(onShow(), { agents: false, list: false, thread: true }, "one at a time under 96 columns");
  assert.equal(screen()?.levels, 1);
  sized(96);
  assert.deepEqual(onShow(), { agents: false, list: true, thread: true }, "two from 96");
  sized(128);
  assert.deepEqual(onShow(), { agents: true, list: true, thread: true }, "three from 128");

  terminal.type(CTRL_BACKSLASH);
  assert.deepEqual(onShow(), { agents: false, list: false, thread: true }, "Ctrl+\\ puts them back to one at a time");
  terminal.type(LEFT);
  assert.deepEqual(onShow(), { agents: false, list: true, thread: false }, "the level the keys are in");
  terminal.type(CTRL_BACKSLASH);
  assert.deepEqual(onShow(), { agents: true, list: true, thread: true }, "and back");
  assert.equal(screen()?.kind, "threads", "with the keys where they were");
});

test("Ctrl+G opens the list of every key, and Esc closes it before it goes back", (t) => {
  const { terminal, state, lines, screen } = start(t, inThread("th_1"));
  const listed = (): boolean => {
    const drawn = lines().join("\n");
    return lines().some((line) => line.includes(KEYS_TITLE) && line.includes(CLOSE_KEYS.join(" "))) && ALL_KEYS.every(([group]) => drawn.includes(group));
  };
  terminal.type("kept");
  terminal.type(CTRL_G);
  assert.ok(listed(), lines().join("\n"));
  terminal.type("x");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, [], "while it is open, the keys act on nothing behind it");
  terminal.type(ESC);
  assert.ok(!listed(), "esc closed it");
  assert.equal(screen()?.kind, "thread", "and only closed it");
  assert.ok(shows(lines(), "kept"));
  terminal.type(ESC);
  assert.equal(screen()?.kind, "threads", "the next esc goes back");
  assert.deepEqual(state.calls, []);
});

test("a click chooses a row, and opens it", (t) => {
  const first = aModel({ listing: aListing([anAgent("mechanic"), anAgent("scout"), aChatServer()]) });
  const { terminal, state, lines } = start(t, first);
  const row = lines().findIndex((line) => line.trim().startsWith("scout"));
  assert.ok(row > 0);
  for (const each of click(4, row)) terminal.type(each);
  assert.deepEqual(state.calls, [`select ${scout.id}`]);
});

test("a slash opens the list of commands, which typing narrows and Esc closes", async (t) => {
  const { terminal, state, drawn, lines, screen } = start(t, conversation());

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
  assert.ok(shows(lines(), "/sto"), "and leaves the text as it was");
  assert.deepEqual(state.calls, [], "without leaving the thread");
  assert.equal(screen()?.kind, "thread");
  terminal.type(ESC);
  assert.equal(screen()?.kind, "threads", "the next escape goes back");
  assert.deepEqual(state.calls, []);
});

test("Enter acts on the command chosen in the list, and Tab only puts it in the editor", async (t) => {
  // A session behind the thread, which Tab would turn over to if the list did not have it.
  const { terminal, state, drawn, lines } = start(t, { ...conversation(), behind: { [scout.id]: sessionView() } });

  terminal.type("/st");
  await until(() => drawn().includes(lineOf("/stop")), "the list of commands");
  terminal.type(DOWN);
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["write /stop"], "enter completes the chosen command and writes it");
  assert.ok(!drawn().includes(lineOf("/stop")), "and closes the list");

  terminal.type("/sta");
  await until(() => drawn().includes(lineOf("/status")), "the list of commands");
  terminal.type(TAB);
  assert.deepEqual(state.calls, ["write /stop"], "tab acts on nothing");
  assert.ok(shows(lines(), "/status"), "it puts the command in the editor");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["write /stop", "write /status"], "and enter writes it");
});

test("/status shows a block for the person alone, which goes once a message is sent or the thread is left", { timeout: 30_000 }, async (t) => {
  const rig = await startRig(t, { now: () => now });
  const thread = await rig.thread("scout", "go");
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render()).join("\n");
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  const posted = async (): Promise<string[]> => (await (await rig.person()).read(thread.id, null, 10)).map((message) => message.text);
  /** The header of the block `/status` shows, as the views word it. */
  const header = async (): Promise<string> => {
    const model = await rig.until((each) => each.status !== undefined, "the reading");
    const block = threadLevel(model, { now, self: SELF })?.status;
    assert.ok(block);
    return block.header;
  };
  await rig.until((model) => model.open.list !== undefined, "the agent's list");
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
  terminal.type(LEFT);
  // The thread is the newest of the agent's list, and so the row chosen.
  rig.state.openThread(thread.id);
  await seen("hello");
  assert.ok(!drawn().includes(shown), "the reading is gone once the thread has been opened again");
});

const SMALL = { provider: "local", id: "small-model" };
const BIG = { provider: "local", id: "big-model" };
const TWO_MODELS = { models: [{ ...BIG, name: "Big Model" }, { ...SMALL, name: "Small Model" }], default: SMALL };

test("/model and a space lists default and the agent's models, and choosing one posts the command", async (t) => {
  const { terminal, state, drawn } = start(t, conversation());
  state.answers.models = TWO_MODELS;

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

  assert.deepEqual(state.calls, ["write /model local/big-model"], "it is written whole");
});

test("a model can be chosen in a thread not started yet", async (t) => {
  const dm = { kind: "agent" as const, id: scout.id };
  const unstarted = aModel({ open: { list: dm, item: { kind: "thread", place: dm, thread: undefined, side: undefined } }, listing: aListing([anAgent("scout"), aChatServer()]) });
  const { terminal, state, drawn } = start(t, unstarted);
  state.answers.models = TWO_MODELS;

  terminal.type("/model big");
  await until(() => drawn().includes("local/big-model"), "the list of models");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["write /model local/big-model"]);
});

test("a model typed whole and followed at once by Enter is the model chosen", async (t) => {
  const { terminal, state, drawn } = start(t, conversation());
  state.answers.models = TWO_MODELS;

  terminal.type("/model ");
  await until(() => drawn().includes("local/small-model"), "the list of models");
  terminal.type("local/big-model");
  terminal.type(ENTER);

  assert.deepEqual(state.calls, ["write /model local/big-model"], "the list still had default chosen, which no longer fit what was typed");
});

test("in a room the list of commands says how /model is written there", async (t) => {
  const inRoom = aThread("th_2", { preview: "go" });
  const ops = { kind: "room" as const, id: "ch_2" };
  const room = aModel({
    open: { list: ops, item: { kind: "thread", place: ops, thread: "th_2", side: undefined } },
    listing: aListing([anAgent("scout"), aChatServer()]),
    rooms: { ch_2: aRoom("ops", ["scout"], [inRoom]) },
  });
  const { terminal, drawn } = start(t, room);
  const model = lineOf("/model", room);
  assert.notEqual(model, lineOf("/model"), "its line is the room's, which says how to write it there");

  terminal.type("/");
  // The list cuts a line to the width it has.
  await until(() => drawn().includes(model.slice(0, 30)), "the list of commands, with /model among them");
});

test("Esc and Left go back from a thread where the agent is working, and stop nothing", (t) => {
  const busy = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });
  const model = onThread("scout", busy, aThreadView(busy, []), {
    behind: { [scout.id]: workingView([userItem("go"), toolItem("bash", { args: { command: "ls" } })], { kind: "tool", name: "bash" }) },
  });
  const { terminal, state, drawn, screen } = start(t, model, { columns: 100 });
  const shown = screen();
  assert.ok(shown?.kind === "thread" && shown.working !== undefined && drawn().includes(shown.working), "the dock has the line that says the agent is working");

  terminal.type(ESC);
  terminal.type(ESC_RELEASED);
  assert.equal(screen()?.kind, "threads", "a press is one press, whether or not the terminal reports the key being let go");
  terminal.type(RIGHT);
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "threads");

  assert.deepEqual(state.calls, ["open th_1"], "and nothing is stopped");
});

test("Ctrl+O shows tool calls in full and Ctrl+T the thinking, and each press again puts it back", (t) => {
  const thinking = Array.from({ length: 6 }, (_, index) => `thought ${String(index + 1)}`).join("\n");
  const output = Array.from({ length: 20 }, (_, index) => `line ${String(index + 1)}`).join("\n");
  const work = workingView(
    [
      userItem("go"),
      assistantItem("Looking.", { thinking, ended: "called_tools" }),
      toolItem("bash", { args: { command: "ls", timeout: 30 }, status: "done", output }),
    ],
    { kind: "working" },
  );
  const working = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] });
  const where = {
    "work in your DM thread": onThread("scout", working, undefined, { behind: { [scout.id]: work } }),
    "a session being watched": onSession("scout", aSession("th_2"), work),
  };

  for (const [shown, model] of Object.entries(where)) {
    const { terminal, drawn } = start(t, model, { rows: 60 });

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

test("a text the state does not take comes back to the editor, ahead of anything typed since", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  state.answers.write = false;

  terminal.type("will not go");
  terminal.type(ENTER);
  await until(() => shows(lines(), "will not go"), "the message to come back to the editor");

  terminal.type("!");
  terminal.type(ENTER);
  await until(() => shows(lines(), "will not go!"), "the message to come back again, with what was typed since");
});

test("Ctrl+C clears what is typed, and only a second press quits", async (t) => {
  const { terminal, drawing, lines } = start(t, conversation());
  let left = false;
  void drawing.left.then(() => {
    left = true;
  });

  terminal.type("some text");
  terminal.type(CTRL_C);
  await until(() => lines().at(-1)?.trim() === QUIT_AGAIN, "the line that says another press quits");

  assert.doesNotMatch(lines().join("\n"), /some text/);
  assert.equal(left, false, "the first press did not quit");
  terminal.type(CTRL_C);
  await drawing.left;

  assert.equal(left, true);
});

test("a screen where nothing works is not drawn again for nothing, and one where an agent works keeps moving", async (t) => {
  // The test moves the clock, so that what moves, and the drawing it asks for, run when the test says and not before.
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  stopAfter(t, () => t.mock.timers.reset());
  const quiet = scoutsList();
  const { state, terminal } = start(t, quiet);
  /** Run what waits for the next turn of the event loop, which is where a request to draw goes first. */
  const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
  /** Let `ms` pass, and then draw what was asked for meanwhile, which waits a few milliseconds of its own. */
  const pass = async (ms: number): Promise<void> => {
    await turn();
    t.mock.timers.tick(ms);
    await turn();
    t.mock.timers.tick(50);
    await turn();
  };
  const frames = (): number => terminal.written.filter((each) => each.includes("\u001b[?2026h")).length;
  await pass(10_000);
  const before = frames();
  await pass(2_000);
  assert.equal(frames(), before, "nothing is drawn again while nothing changes");

  state.show(scoutsList({ dms: { [scout.id]: aDm("scout", [aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: now }] })]) } }));
  await pass(100);
  const working = frames();
  for (let step = 0; step < 10; step += 1) await pass(200);
  assert.ok(frames() >= working + 10, "while an agent works, its lantern moves");
});

test("nothing drawn is wider than the terminal, however narrow or wide, whatever the characters", (t) => {
  const model = onThread(
    "scout",
    aThread("th_1", { preview: "日本語のとても長い題名です 🦐🦐🦐", working: [{ memberId: scout.id, since: now }] }),
    aThreadView(open, [
      aMessage("msg_1", zach, "日本語 ".repeat(30) + "averyveryveryveryveryveryverylongwordwithoutanyspacesatall".repeat(3), { sentAt: at(14, 5) }),
      aMessage("msg_2", scout, "| a | b |\n|---|---|\n| 1111111111111111111 | 2222222222222222222 |\n\n```\nlong code line long code line long code line long code line\n```", { sentAt: at(14, 6) }),
    ]),
    {
      behind: {
        [scout.id]: workingView([
          userItem("go"),
          toolItem("bash", { args: { command: "echo " + "x".repeat(200) }, output: "y".repeat(300) }),
          assistantItem("🦐".repeat(60), { streaming: true }),
        ]),
      },
      notice: { kind: "not-sent", problem: { said: "日本語".repeat(20) } },
    },
  );
  const { drawing, state, terminal } = start(t, model);
  const fits = (): void => {
    for (const width of [12, 20, 33, 80, 100, 150, 220]) {
      terminal.columns = width;
      for (const line of drawing.render()) assert.ok(visibleWidth(line) <= width, `${String(visibleWidth(line))} > ${String(width)}: ${line}`);
    }
  };
  fits();

  const place = { kind: "room" as const, room: "日本語のとても長い部屋", thread: { main: false, name: "averyveryveryverylongthreadnamewithoutanyspacesatall".repeat(2) } };
  const sessions = [aSession("th_2", { place, working: true })];
  const agent = { kind: "agent" as const, id: scout.id };
  state.show({ ...model, open: { list: agent, item: undefined }, sessions });
  fits();
  terminal.type(TAB);
  fits();
  state.show({ ...model, open: { list: agent, item: { kind: "session", agent: scout.id, session: "th_2" } }, watched: model.behind[scout.id], sessions });
  fits();
  state.show({ ...model, open: { list: agent, item: { kind: "thread", place: agent, thread: "th_1", side: scout.id } }, sessions });
  fits();
  terminal.type(CTRL_O);
  terminal.type(CTRL_T);
  terminal.type(CTRL_G);
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
  const work = workingView(
    [
      userItem(`shown${hostile}`),
      assistantItem(`answer${hostile}`, { thinking: `thinking${hostile}`, streaming: true }),
      toolItem(`tool${hostile}`, { args: { command: `echo ${hostile}` }, output: `output${hostile}`, notes: [`note${hostile}`] }),
    ],
    { kind: "tool", name: `tool${hostile}` },
  );
  work.status.queued.push({ when: "next_step", text: `queued${hostile}` });
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
      behind: { [scout.id]: work },
      sessions,
      workingSessions: { [scout.id]: sessions.filter((each) => each.working) },
      listing: aListing([anAgent("scout", `1.0${hostile}`), aChatServer(`3.0${hostile}`)], `2.0${hostile}`),
      rooms: { ch_2: aRoom(`ops${hostile}`, ["scout"], [thread]) },
      readOnly: {
        ch_3: { channel: { id: "ch_3", kind: "dm" as const, name: "x", members: others }, threads: [thread], unread: {} },
        ch_4: { channel: { id: "ch_4", kind: "room" as const, name: `lab${hostile}`, members: others }, threads: [thread], unread: {} },
      },
      notice: { kind: "not-sent", problem: { said: `said${hostile}` } },
    },
  );
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
          failure: { reason: "other", detail: `why${hostile}` },
          wakeups: [{ due: now, note: `wake${hostile}` }],
        },
        othersWorking: 1,
      },
    },
    room: {
      at: now,
      about: { kind: "room", agents: [{ name: `lurker${hostile}`, running: true, working: true }], wakeups: [{ agent: `lurker${hostile}`, wakeup: { due: now, note: `later${hostile}` } }] },
    },
  };
  const notices: Notice[] = [
    { kind: "no-command", written: `/path${hostile}`, commands: [`/stop${hostile}`] },
    { kind: "model-is", model: used, own: true, defaultModel: used },
    { kind: "model-unstarted", defaultModel: used },
    { kind: "model-not-shown", problem: { down: { kind: "unreachable", message: `agent${hostile}` } } },
  ];
  const dm = { kind: "agent" as const, id: scout.id };
  const room = { kind: "room" as const, id: "ch_2" };
  // Wide enough that every level is on show at once.
  const { terminal, drawing, state } = start(t, model, { columns: 150, rows: 50 });

  const drawn = [...drawing.render()];
  const show = (next: Model): void => {
    state.show(next);
    drawn.push(...drawing.render());
  };
  const inThread = (place: Place, side?: string): Model["open"] => ({
    list: place.kind === "room" ? place : dm,
    item: { kind: "thread", place, thread: "th_1", side },
  });
  show({ ...model, open: { list: dm, item: undefined } });
  show({ ...model, open: { list: dm, item: { kind: "session", agent: scout.id, session: "th_9" } }, watched: work, watchRefusal: `refused${hostile}` });
  show({ ...model, open: inThread(dm, scout.id) });
  show({ ...model, open: inThread(dm), status: statuses.agent });
  show({ ...model, open: { list: room, item: undefined } });
  show({ ...model, open: inThread(room), status: statuses.room });
  show({ ...model, open: { list: { kind: "read-only", id: "ch_4" }, item: undefined } });
  show({ ...model, open: inThread({ kind: "read-only", id: "ch_3" }) });
  show({
    ...model,
    chat: { state: "down", why: { kind: "unreachable", message: `chat${hostile}` } },
    agent: { state: "down", why: { kind: "unreachable", message: `gone${hostile}` } },
    behind: { [scout.id]: { ...work, reached: false } },
  });
  for (const notice of notices) show({ ...model, notice });
  // The list `/model` opens has what the agent calls its models.
  show({ ...model, notice: undefined });
  state.answers.models = { models: [{ ...used, name: `Gemma${hostile}` }], default: used };
  terminal.type("/model ");
  await until(() => visible(drawing.render()).join("\n").includes("Gemma"), "the list of models");
  drawn.push(...drawing.render());
  show({ ...model, open: { list: undefined, item: undefined } });
  await until(() => terminal.output().includes(SHRIMPY_RELEASE_NAME), "the terminal to be written");

  // Styles are the console's own, and so are pi-tui's markers of where the cursor is and the ends of its links. Once those are taken out, nothing but text is left.
  const own = new RegExp("\\u001b\\[[0-9;:]*m|\\u001b_pi:[^\\u0007]*\\u0007|\\u001b\\]8;;\\u0007", "g");
  const text = drawn.join("\n").replace(own, "");
  assert.doesNotMatch(text, new RegExp("[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f]"));
  for (const wanted of ["Evil", "text", "detail", "reply", "\u{1F44D}", "answer", "thinking", "output", "note", "said", "shown", "queued", "mechanic", "thread", "refused", "ops", "lab", "lurker", "later", "path", "Gemma"]) {
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
  const { drawing, terminal } = start(t, model, { columns: 120 });

  const text = drawing.render().join("\n");

  assert.doesNotMatch(text, /\u001b\]8;;[^\u0007]/);
  assert.doesNotMatch(terminal.output(), /\u001b\]8;;[^\u0007]/);
  assert.match(visible(drawing.render()).join("\n"), /the bank \(https:\/\/evil\.example\/login\)/);
});

test("the draft in the editor survives losing chat and the agent, and finding them again", (t) => {
  const { terminal, state, lines } = start(t, conversation());
  terminal.type("half a thought");

  state.show({ ...conversation(), chat: { state: "down", why: { kind: "lost" } }, agent: { state: "down", why: { kind: "lost" } } });
  assert.ok(!shows(lines(), "half a thought"), "the input goes while chat is lost");
  state.show(conversation());

  assert.ok(shows(lines(), "half a thought"));
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
  const { state, drawn, screen } = start(t, onThread("scout", thread, aThreadView(thread, [aMessage("msg_1", zach, "x")], 37)));
  // One level is on show, so the lines of the thread are all there is, and a sentence wrapped over two is read as one.
  const said = (): string => drawn().replace(/\s+/g, " ");
  const lead = (): string | undefined => {
    const shown = screen();
    return shown?.kind === "thread" || shown?.kind === "session" ? shown.lead : undefined;
  };
  const before = lead();
  assert.ok(before !== undefined && said().includes(before), drawn());

  state.show(onSession("scout", aSession("trigger:nightly"), sessionView({ items: [userItem("the newest", 140)], before: 139 })));
  const earlier = lead();
  assert.ok(earlier !== undefined && said().includes(earlier), drawn());
  state.show(onSession("scout", aSession("trigger:nightly"), sessionView({ items: [userItem("the first", 1)] })));
  assert.equal(lead(), undefined, "one that starts at the session's start has nothing more to read");
  assert.ok(!said().includes(earlier), drawn());
});

test("an image a session was shown, or a tool gave back, is named by its media type", (t) => {
  const view = sessionView({
    items: [
      userItem("what is in this picture?", 1, [{ mimeType: "image/png" }]),
      toolItem("read", { status: "done", output: "shot.jpg", images: [{ mimeType: "image/jpeg" }], entry: 2 }),
    ],
  });
  const { drawn } = start(t, onSession("scout", aSession("th_1"), view), { columns: 100 });

  assert.ok(drawn().includes("image/png") && drawn().includes("image/jpeg"), drawn());
});

test("a trigger's own session is on the agent's list, which opens on it while it works, and takes no input", (t) => {
  const nightly = aSession("trigger:nightly", { place: { kind: "trigger", trigger: "nightly" }, working: true });
  const disk = aThread("th_a", { preview: "check the disk", updatedAt: at(14, 5) });
  const list = aModel({
    open: { list: { kind: "agent", id: scout.id }, item: undefined },
    listing: aListing([anAgent("scout"), aChatServer()]),
    agent: { state: "up" },
    dms: { [scout.id]: aDm("scout", [disk]) },
    sessions: [nightly],
  });
  const { terminal, state, drawn, screen } = start(t, list, { columns: 100 });
  assert.ok(drawn().includes("check the disk") && drawn().includes("nightly"), "the trigger's session is a row beside the person's thread");

  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["watch trigger:nightly"], "the row that is working was the one chosen");
  state.show(onSession("scout", nightly, workingView([userItem("It is 02:00."), toolItem("bash", { args: { command: "df -h" } })], { kind: "tool", name: "bash" })));
  assert.match(drawn(), /df -h/);
  terminal.type("hello");
  terminal.type(ENTER);
  assert.doesNotMatch(drawn(), /hello/, "there is no editor to type in");
  assert.doesNotMatch(drawn(), /\/stop/, "and so no way to stop the work is offered");
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "threads", "left went back");
  assert.deepEqual(state.calls, ["watch trigger:nightly"], "and nothing was sent");
  state.show(list);
  terminal.type(ENTER);
  assert.equal(state.calls.at(-1), "watch trigger:nightly", "coming back to the list is not opening it again: the choice stayed where it was");
});

test("/devices lists the person's devices, and /devices take back ends a device's link", { timeout: 30_000 }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const rig = await startRig(t);
  const [address] = gateway.listening.listen;
  assert.ok(address);
  // A machine of the person's joins with an invitation and the hello `shrimpy join` says, and links in with its token.
  const person = await gateway.connect();
  const roster = await person.host.get(Roster, {}, BACKGROUND_CONTEXT);
  stopAfter(t, () => roster.release());
  const invited = await roster.inviteDevice(BACKGROUND_CONTEXT);
  assert.ok(invited.kind === "done");
  const { code, fingerprint } = invited.value;
  const entry = { ...address, fingerprint };
  const token = newToken();
  const joined = await sayHello(entry, { kind: "join", name: null, token, code, machine: hostname() });
  joined.linked.drop();
  const device = await connectClient({ place: entry, token });
  stopAfter(t, () => device.close());
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const drawn = (): string => visible(drawing.render()).join("\n");
  await rig.until((model) => model.open.list !== undefined, "the agent's list");
  rig.state.startThread();

  terminal.type("/devices");
  terminal.type(ENTER);
  await until(() => drawn().includes(hostname()), "the device to be listed by its label");
  terminal.type(`/devices take back ${hostname()}`);
  terminal.type(ENTER);

  await within(10_000, device.closed, "the device's link to end");
  await until(() => roster.ways.value.every((way) => way.kind !== "device"), "the roster to have no device");
});

test("a thread on show is marked read as messages come, and one that is not on show is not", { timeout: 30_000 }, async (t) => {
  const rig = await startRig(t);
  const scout = await rig.member("scout");
  const asScout = await rig.asAgent("scout");
  const other = await rig.thread("scout", "something else");
  const first = await rig.thread("scout", "first");
  await asScout.post(first.id, "one");
  // Two levels side by side: the thread stays on show while the keys are in the list.
  const terminal = new FakeTerminal(100, 30);
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000 });
  stopAfter(t, () => drawing.stop());
  const unread = (model: Model, threadId: string): number | undefined => model.dms[scout.id]?.unread[threadId];
  await rig.until((model) => model.open.list !== undefined && unread(model, first.id) === 1, "what scout said to be new");

  // The thread is the newest on the agent's list, and so the row chosen.
  terminal.type(ENTER);
  await rig.until((model) => unread(model, first.id) === 0, "the thread on show to be read");
  terminal.type(LEFT);
  await asScout.post(first.id, "two");
  await rig.until((model) => model.thread?.messages.length === 3 && model.thread.unread === 0, "what comes while it is on show beside the list to be read");

  // One level at a time: with the keys in the list, the thread is not on show.
  terminal.columns = 80;
  drawing.render();
  await asScout.post(first.id, "three");
  await rig.until((model) => model.thread?.messages.length === 4, "the thread, still open behind the list, to have what came");
  await asScout.post(other.id, "and here");
  await rig.until((model) => unread(model, other.id) === 1, "the thread never on show to have what came");
  assert.equal(rig.state.model().thread?.unread, 1, "a thread not on show is not marked read");
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
  // One level at a time, so that each level is the one on show.
  const terminal = new FakeTerminal(90, 30);
  let shown: Screen | undefined;
  const drawing = startDrawing({ state: rig.state, terminal, now: () => now, quitWindowMs: 60_000, onDraw: (screen) => void (shown = screen) });
  stopAfter(t, () => drawing.stop());
  const lines = (): string[] => visible(drawing.render());
  const drawn = (): string => lines().join("\n");
  const screen = (): Screen | undefined => shown;
  const seen = (text: string): Promise<void> => until(() => drawn().includes(text), `the screen to show ${text}`);
  const said = async (threadId: string): Promise<string[]> => (await you.read(threadId, null, 50)).map((message) => message.text);
  return { rig, scout, mechanic, you, asScout, mine, home, dm, lab, terminal, lines, drawn, screen, seen, said };
}

/** The list open in the state is the agent's with member ID `id`, or any agent's when it is left out. */
const agentListOpen =
  (id?: string) =>
  (model: Model): boolean =>
    model.open.list?.kind === "agent" && (id === undefined || model.open.list.id === id);

test("the first screen marks a room the person only reads, and an agent's list has its DMs with other agents", { timeout: 30_000 }, async (t) => {
  const { rig, scout: scoutMember, mechanic: mechanicMember, home, lab, terminal, lines, screen, seen, said } = await amongOthers(t);
  await seen("#lab");
  const rowOf = (text: string): string => lines().find((line) => line.includes(text)) ?? "";
  const onlyRead = lines().filter((line) => line.includes(READ_ONLY_TAG));

  assert.equal(onlyRead.length, 1, "the room they are not in says so, and no row but it does: the DM between the agents is not on the screen");
  assert.ok(onlyRead[0]?.includes("read-only"));
  const idle = rowOf("#lab");
  const working = await rig.asAgent("mechanic");
  await working.setWorking(lab.thread.id, true);
  await until(() => rowOf("#lab") !== idle, "the room to say someone is working in it");
  await working.setWorking(lab.thread.id, false);

  terminal.type(DOWN);
  terminal.type(RIGHT);
  await rig.until(agentListOpen(), "scout's list");
  await seen("the backup finished");
  assert.ok(rowOf("check the disk") !== "" && !rowOf("check the disk").includes("mechanic"), "its thread with the person");
  assert.ok(rowOf("the backup finished").includes("mechanic"), "its DM with mechanic, which says who it is with");

  terminal.type(TAB);
  await until(() => rowOf("the backup finished") === "", "the list to narrow to the person's threads");
  assert.ok(rowOf("check the disk") !== "");
  terminal.type(TAB);
  await seen("the backup finished");

  // A thread of a room the person is in takes what they type, from here as from the room, and Left comes back here.
  rig.state.openThread(home.thread.id);
  await rig.until((model) => model.thread?.thread.id === home.thread.id, "the room's thread");
  terminal.type("is it fixed?");
  terminal.type(ENTER);
  await eventually(() => said(home.thread.id), (texts) => texts.includes("is it fixed?"), { what: "what was typed to be posted in the room" });
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "threads");
  assert.deepEqual(rig.state.model().open.list, { kind: "agent", id: scoutMember.id });

  // The other agent in that DM has it on its list too.
  terminal.type(LEFT);
  terminal.type(UP);
  terminal.type(RIGHT);
  await rig.until(agentListOpen(mechanicMember.id), "mechanic's list");
  await seen("the backup finished");
  assert.ok(rowOf("the backup finished").includes("scout"));
});

test("a thread of a DM between two agents shows what both said, and takes no input", { timeout: 30_000 }, async (t) => {
  const { rig, mine, dm, terminal, drawn, screen, seen, said } = await amongOthers(t);
  terminal.type(DOWN);
  terminal.type(RIGHT);
  await rig.until(agentListOpen(), "scout's list");
  await seen("the backup finished");

  rig.state.openThread(dm.thread.id);
  await rig.until((model) => model.thread?.messages.length === 2, "the DM's thread");

  assert.ok(drawn().includes("the backup finished") && drawn().includes("thanks, I checked it"), "what both said");
  const why = threadLevel(rig.state.model(), { now, self: SELF })?.readOnly;
  assert.ok(why !== undefined && drawn().includes(why.slice(0, 40)), "the line that says why nothing can be written is where the input would be");
  terminal.type("hello");
  terminal.type(ENTER);
  terminal.type(CTRL_N);
  assert.doesNotMatch(drawn(), /hello|\/stop/, "what is typed goes nowhere, and no way to stop the work is offered");
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "threads", "left goes back");
  assert.deepEqual(await said(dm.thread.id), ["the backup finished", "thanks, I checked it"], "nothing typed was sent");

  // Where no agent has a session behind the thread, Tab does nothing.
  rig.state.openThread(mine.id);
  await rig.until((model) => model.thread?.thread.id === mine.id, "the person's own thread");
  const opened = rig.state.model().open;
  terminal.type(TAB);
  assert.deepEqual(rig.state.model().open, opened);
});

test("a thread of a room the person only reads takes no input, and shows what is said as it comes", { timeout: 30_000 }, async (t) => {
  const { rig, you, asScout, lab, terminal, drawn, screen, seen, said } = await amongOthers(t);
  const threadsIn = async (channelId: string): Promise<number> => (await you.threads(channelId)).length;

  rig.state.selectReadOnly(lab.channel.id);
  rig.state.openThread(lab.thread.id);
  await seen("the bench is free");
  const shown = screen();
  assert.ok(shown?.kind === "thread" && shown.readOnly !== undefined && drawn().replace(/\s+/g, " ").includes(shown.readOnly), "a room says how to join it");
  terminal.type("hello");
  terminal.type(ENTER);
  terminal.type(CTRL_N);
  terminal.type("/");
  assert.equal(screen()?.kind, "thread");
  assert.deepEqual(rig.state.model().open.item, { kind: "thread", place: { kind: "read-only", id: lab.channel.id }, thread: lab.thread.id, side: undefined });
  assert.doesNotMatch(drawn(), /hello|\/stop|\/status/, "what is typed goes nowhere, and no list of commands opens");

  // What scout says after the keys arrives after anything they would have sent.
  await asScout.post(lab.thread.id, "one more thing");
  await seen("one more thing");
  assert.deepEqual(await said(lab.thread.id), ["the bench is free", "one more thing"], "nothing typed was sent");
  assert.equal(await threadsIn(lab.channel.id), 1, "and no thread was started");

  terminal.type(LEFT);
  assert.equal(screen()?.kind, "threads", "left goes back as everywhere");
  await asScout.setWorking(lab.thread.id, true);
  // The room's main thread is its only one, and so the row chosen.
  terminal.type(RIGHT);
  await rig.until((model) => model.thread?.thread.id === lab.thread.id && model.thread.thread.working.length > 0, "the work to show");
  assert.doesNotMatch(drawn(), /\/stop/, "no way to stop the work is offered, which the person can't write");
  terminal.type("hello");
  terminal.type(ENTER);
  terminal.type(LEFT);
  assert.equal(screen()?.kind, "threads", "left goes back");
  assert.deepEqual(await said(lab.thread.id), ["the bench is free", "one more thing"], "nothing typed here was sent either");
});

test("a room the person joins while reading it takes their input from then on", { timeout: 30_000 }, async (t) => {
  const { rig, lab, terminal, seen, said } = await amongOthers(t);
  rig.state.selectReadOnly(lab.channel.id);
  rig.state.openThread(lab.thread.id);
  await seen("the bench is free");

  await rig.state.joinRoom();
  await rig.until((model) => model.open.item?.kind === "thread" && model.open.item.place.kind === "room", "the thread to become the room's");
  terminal.type("hello");
  terminal.type(ENTER);

  await eventually(() => said(lab.thread.id), (texts) => texts.includes("hello"), { what: "the message to be posted" });
});
