import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setCapabilityOverrides, visibleWidth } from "@earendil-works/pi-tui";
import { assistantItem, toolItem, userItem, workingView } from "../../../contracts/agent/testing/index.ts";
import { agentMember } from "../../../contracts/chat/index.ts";
import { settle, stopAfter, until } from "../../../lib/testing/index.ts";
import type { Model } from "../state/index.ts";
import {
  aChatServer,
  aDm,
  aMessage,
  aModel,
  anAgent,
  aReceipt,
  aThread,
  aThreadView,
  type FakeState,
  fakeState,
  onThread,
  zach,
} from "../state/testing/index.ts";
import { type Drawing, startDrawing } from "./index.ts";
import { FakeTerminal, visible } from "./testing/index.ts";

const scout = agentMember("scout");
const at = (hour: number, minute: number): number => new Date(2026, 9, 3, hour, minute).getTime();
const now = at(15, 0);

const DOWN = "\u001b[B";
const ENTER = "\r";
const ESC = "\u001b";
const CTRL_C = "\u0003";
const CTRL_T = "\u0014";
const CTRL_N = "\u000e";

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
    listing: { programs: [anAgent("scout"), anAgent("mechanic"), aChatServer()], version: "0.0.0" },
    dms: { scout: aDm("scout", [open]) },
  });

const threadsModel = (): Model =>
  aModel({
    where: { screen: "threads", agent: "scout" },
    listing: { programs: [anAgent("scout"), aChatServer()], version: "0.0.0" },
    dms: {
      scout: aDm("scout", [
        aThread("th_a", { preview: "Check the disk usage", updatedAt: at(14, 5), working: [{ memberId: scout.id, since: now }] }),
        aThread("th_b", { preview: "Remind me about the dentist", updatedAt: at(9, 2) }),
      ]),
    },
  });

test("the agents are listed with a choice marked, and the keys are named", (t) => {
  const { lines } = start(t, agentsModel());

  assert.deepEqual(lines(), [
    "Agents",
    "",
    "→ mechanic                idle",
    "  scout                   idle",
    "↑↓ choose · enter open · ctrl+c twice to quit",
  ]);
});

test("the arrow keys move the choice, and enter opens it", (t) => {
  const { terminal, state, lines } = start(t, agentsModel());

  terminal.type(DOWN);
  assert.equal(lines()[2], "  mechanic                idle");
  assert.equal(lines()[3], "→ scout                   idle");
  terminal.type(ENTER);

  assert.deepEqual(state.calls, ["select scout"]);
});

test("the choice stays where it was when the list is drawn again with something changed", (t) => {
  const { terminal, state, lines } = start(t, agentsModel());
  terminal.type(DOWN);

  state.show({ ...agentsModel(), listing: { programs: [anAgent("scout"), anAgent("mechanic"), anAgent("zed"), aChatServer()], version: "0.0.0" } });

  assert.deepEqual(lines().slice(2, 5), ["  mechanic                idle", "→ scout                   idle", "  zed                     idle"]);
});

test("an agent's threads are listed, enter opens one, n starts one and escape goes back", (t) => {
  const { terminal, state, lines } = start(t, threadsModel());

  assert.deepEqual(lines(), [
    "scout · your threads",
    "",
    "→ Check the disk usage         14:05 · working",
    "  Remind me about the dentist  09:02",
    "↑↓ choose · enter open · n new thread · esc agents · ctrl+c twice to quit",
  ]);
  terminal.type(DOWN);
  terminal.type(ENTER);
  terminal.type("n");
  terminal.type(ESC);

  assert.deepEqual(state.calls, ["open th_b", "start", "back"]);
});

test("a screen with nothing to choose from says why, and has no list to move in", (t) => {
  const { terminal, state, lines } = start(t, aModel({ where: { screen: "threads", agent: "scout" } }));

  assert.deepEqual(lines().slice(0, 3), ["scout · your threads", "", "You have not talked to scout yet. Press n to start a thread."]);
  terminal.type(ENTER);
  terminal.type("n");
  assert.deepEqual(state.calls, ["start"]);
});

test("a thread shows who said what, the editor, and the keys, with what an agent did with a message under it", (t) => {
  const { lines } = start(t, conversation());

  assert.deepEqual(lines(), [
    "scout · Check the disk usage",
    "",
    "zach  14:05",
    "  Check the disk usage",
    "",
    "scout  14:06",
    "  Disk is 43% used.",
    "",
    "zach  14:07",
    "  And the logs?",
    "  -- scout failed: The model failed: nope --",
    "─".repeat(80),
    "",
    "─".repeat(80),
    "enter send · esc stop · ctrl+t threads · ctrl+n new · ctrl+c clear, then quit",
  ]);
});

test("a note is drawn by the editor at the bottom, so a long conversation does not push it out of sight", (t) => {
  const messages = Array.from({ length: 40 }, (_, index) => aMessage(`msg_${String(index + 1)}`, zach, `message ${String(index + 1)}`, { sentAt: at(14, 5) }));
  const long = onThread("scout", open, aThreadView(open, messages), { notice: { kind: "stopped" } });
  const { lines } = start(t, long);

  const shown = lines();

  assert.deepEqual(shown.slice(-6), [
    "",
    "Stopped scout's work in this thread.",
    "─".repeat(80),
    "",
    "─".repeat(80),
    "enter send · esc stop · ctrl+t threads · ctrl+n new · ctrl+c clear, then quit",
  ]);
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

test("escape stops the work, control-t goes to the threads and control-n starts a thread", (t) => {
  const { terminal, state } = start(t, conversation());

  terminal.type(ESC);
  terminal.type(CTRL_T);
  terminal.type(CTRL_N);

  assert.deepEqual(state.calls, ["stop", "back", "start"]);
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
  assert.equal(lines().at(-1), "Press Ctrl+C again to quit.");
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
  assert.equal(lines().at(-1), "Press Ctrl+C again to quit.");
  terminal.type("x");
  assert.equal(lines().at(-1), "enter send · esc stop · ctrl+t threads · ctrl+n new · ctrl+c clear, then quit");
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
  await until(() => lines().at(-1) !== "Press Ctrl+C again to quit.", "the wait to end");
  terminal.type(CTRL_C);
  await settle();

  assert.equal(left, false);
  assert.equal(lines().at(-1), "Press Ctrl+C again to quit.");
});

test("control-c quits from the lists too, with nothing to clear", async (t) => {
  const { terminal, drawing } = start(t, agentsModel());
  let left = false;
  void drawing.left.then(() => {
    left = true;
  });

  terminal.type(CTRL_C);
  terminal.type(CTRL_C);
  await settle();

  assert.equal(left, true);
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

  assert.deepEqual(shown.slice(shown.indexOf("zach  14:05")), [
    "zach  14:05",
    "  go",
    "",
    "│ thinking: List the files first.",
    "│ Let me look.",
    "│ ✓ done  bash $ ls",
    "│   a",
    "│   b",
    "│ Two files: a and b",
    "",
    " 🦐   scout is working · answering · esc to stop",
    "─".repeat(80),
    "",
    "─".repeat(80),
    "enter send · esc stop · ctrl+t threads · ctrl+n new · ctrl+c clear, then quit",
  ]);
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
  const { drawing } = start(t, model);

  for (const width of [12, 20, 33, 80, 120]) {
    for (const line of drawing.render(width)) assert.ok(visibleWidth(line) <= width, `${String(visibleWidth(line))} > ${String(width)}: ${line}`);
  }
});

test("text from other members and from tools can't reach the terminal, wherever it appears", async (t) => {
  const ESC_ = "\u001b";
  const hostile = `${ESC_}]0;pwned\u0007${ESC_}[999;999H${ESC_}[2J${ESC_}]52;c;cHduZWQ=\u0007${ESC_}[31mred\u009b6n\rover`;
  const stranger = { id: "person:evil", kind: "person" as const, name: `Evil${hostile}` };
  const thread = aThread("th_1", { name: `Name${hostile}`, preview: `Preview${hostile}`, working: [{ memberId: scout.id, since: now }] });
  const model = onThread(
    "scout",
    thread,
    aThreadView(thread, [
      aMessage("msg_1", stranger, `text${hostile}`, { receipts: [aReceipt("scout", "failed", `detail${hostile}`)] }),
      aMessage("msg_2", scout, `reply [a link](https://evil.example/${hostile}) ${hostile}`),
    ]),
    {
      session: workingView(
        [
          userItem("go"),
          assistantItem(`answer${hostile}`, { thinking: `thinking${hostile}`, streaming: true }),
          toolItem(`tool${hostile}`, { args: { command: `echo ${hostile}` }, output: `output${hostile}`, notes: [`note${hostile}`] }),
        ],
        { kind: "tool", name: `tool${hostile}` },
      ),
      notice: { kind: "not-sent", problem: { said: `said${hostile}` } },
    },
  );
  const { terminal, drawing, state } = start(t, model);

  const drawn = [...drawing.render(80)];
  state.show({ ...model, where: { screen: "threads", agent: "scout" } });
  drawn.push(...drawing.render(80));
  state.show({ ...model, where: { screen: "agents" } });
  drawn.push(...drawing.render(80));
  await until(() => terminal.output().includes("Agents"), "the terminal to be written");

  // Styles are the console's own. Once those and the cursor are taken out, nothing but text is left.
  const own = new RegExp("\\u001b\\[[0-9;:]*m|\\u001b_pi:c\\u0007", "g");
  const text = drawn.join("\n").replace(own, "");
  assert.doesNotMatch(text, new RegExp("[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f]"));
  for (const wanted of ["Evil", "text", "detail", "reply", "answer", "thinking", "output", "note", "said"]) assert.ok(text.includes(wanted), wanted);
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

test("it works with the agent as the one thing in the world", (t) => {
  const one = agentMember("scout");
  const { lines } = start(t, aModel({ listing: { programs: [anAgent(one.name)], version: "0.0.0" } }));

  assert.equal(lines()[2], "→ scout                   idle");
});

