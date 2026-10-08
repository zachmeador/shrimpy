import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setCapabilityOverrides, visibleWidth } from "@earendil-works/pi-tui";
import { assistantItem, toolItem, userItem, workingView } from "../../../contracts/agent/testing/index.ts";
import { AGENT_COMMANDS } from "../../../contracts/chat/index.ts";
import { settle, stopAfter, until } from "../../../lib/testing/index.ts";
import type { Model } from "../state/index.ts";
import {
  aChatServer,
  agentMember,
  aListing,
  aDm,
  aMessage,
  aModel,
  anAgent,
  aReceipt,
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
import { QUIT_AGAIN } from "../screen/index.ts";
import { type Drawing, startDrawing } from "./index.ts";
import { FakeTerminal, visible } from "./testing/index.ts";

const scout = agentMember("scout");
const at = (hour: number, minute: number): number => new Date(2026, 9, 3, hour, minute).getTime();
const now = at(15, 0);

const DOWN = "\u001b[B";
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

test("a slash lists the commands with what each does, more typing narrows the list, escape closes it without leaving the thread, and the next escape goes back", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  const drawn = (): string => lines().join("\n");
  const stop = AGENT_COMMANDS.stop.dm;

  terminal.type("/");
  await until(() => drawn().includes("/stop"), "the list of commands");
  assert.ok(drawn().includes(stop), "with what the command does");
  terminal.type("x");
  await until(() => !drawn().includes("/stop"), "the list to close, since nothing matches");
  terminal.type(BACKSPACE);
  await until(() => drawn().includes("/stop"), "the list to open again");

  terminal.type(ESC);
  assert.ok(!drawn().includes("/stop"), "escape closes the list");
  assert.match(drawn(), /\n \/\n/, "and leaves the text as it was");
  assert.deepEqual(state.calls, [], "without leaving the thread");
  terminal.type(ESC);
  assert.deepEqual(state.calls, ["back"], "the next escape goes back");
});

test("enter chooses the command in the list and the next enter sends it, and a text that starts with a slash and is no command is sent as written", async (t) => {
  const { terminal, state, lines } = start(t, conversation());
  const drawn = (): string => lines().join("\n");

  terminal.type("/st");
  await until(() => drawn().includes(AGENT_COMMANDS.stop.dm), "the list of commands");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, [], "choosing sends nothing");
  assert.match(drawn(), /\n \/stop\n/, "it puts the command in the editor");
  assert.ok(!drawn().includes(AGENT_COMMANDS.stop.dm), "and closes the list");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["send /stop"]);

  terminal.type("/etc/hosts is wrong");
  await settle();
  assert.ok(!drawn().includes(AGENT_COMMANDS.stop.dm), "a text that is no command opens no list");
  terminal.type(ENTER);
  assert.deepEqual(state.calls, ["send /stop", "send /etc/hosts is wrong"]);
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
  await seen("your threads");
  rig.state.openThread(thread.id);
  await seen("scout is working");
  assert.match(drawn(), /scout is working.*\/stop/, "the line that says the agent is working says how to stop it");
  assert.match(drawn(), /esc back/);

  terminal.type(ESC);
  terminal.type(ESC_RELEASED);
  await seen("scout · your threads");
  await settle();

  assert.doesNotMatch(drawn(), /Agents and rooms/, "a press is one press, whether or not the terminal reports the key being let go");
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
  await until(() => terminal.output().includes("your threads"), "the threads to be drawn");
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
  const sessions = [aSession("th_1", { place, working: true })];
  state.show({ ...model, where: { screen: "sessions", agent: "scout" }, sessions });
  fits();
  state.show({ ...model, where: { screen: "session", agent: "scout", session: "th_1" }, sessions });
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
  const sessions = [aSession("th_1", { place: { kind: "dm", with: { name: `mechanic${hostile}`, kind: "agent" }, thread: { main: false, name: `thread${hostile}` } } })];
  state.show({ ...model, where: { screen: "sessions", agent: "scout" }, sessions });
  drawn.push(...drawing.render(80));
  state.show({ ...model, where: { screen: "session", agent: "scout", session: "th_1" }, sessions, refusal: `refused${hostile}` });
  drawn.push(...drawing.render(80));
  state.show({ ...model, where: { screen: "agents" } });
  drawn.push(...drawing.render(80));
  await until(() => terminal.output().includes("Agents"), "the terminal to be written");

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

test("watching a session shows its work as it happens, and nothing typed is sent anywhere", { timeout: 15_000 }, async (t) => {
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

  await seen("your threads");
  terminal.type(TAB);
  await seen("nightly");
  terminal.type(ENTER);
  await seen("df -h");
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
  await seen("its sessions");
  assert.equal(nightly.stops, 0, "going back stops nothing");
});
