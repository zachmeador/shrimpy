import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "../../contracts/chat/index.ts";
import { promptFor, snapshotOf, written } from "./prompt.ts";
import type { Outstanding, Snapshot } from "./turns.ts";

const at = (iso: string): number => Date.parse(iso);

function snapshot(id: string, author: string, text: string, sentAt: string): Snapshot {
  return { id, seq: Number(id.slice(-1)), author, text, sentAt: at(sentAt) };
}

function outstanding(message: Snapshot, earlier: Snapshot[] = []): Outstanding {
  return { message, threadId: "th_4k9x2m7q0b3d", channelId: "ch_8f2m1q7z4c0a", earlier };
}

const where = "Thread th_4k9x2m7q0b3d in channel ch_8f2m1q7z4c0a.";

test("a message is shown with the thread and channel it is in, and under a line that says who wrote it and when", () => {
  const prompt = promptFor(outstanding(snapshot("msg_2", "Zach", "Is the build green?", "2026-10-03T14:05:22.481Z")));

  assert.equal(prompt, `${where}\n\nZach wrote at 2026-10-03T14:05:22Z:\nIs the build green?`);
});

test("earlier messages the agent has not acted on come first, each as written, oldest first", () => {
  const prompt = promptFor(
    outstanding(snapshot("msg_4", "Zach", "Never mind the first one.", "2026-10-03T14:09:00Z"), [
      snapshot("msg_2", "Zach", "Please check the build.", "2026-10-03T14:05:00Z"),
      snapshot("msg_3", "Alex", "Two lines,\nand a blank one below.\n", "2026-10-03T14:06:30Z"),
    ]),
  );

  assert.equal(
    prompt,
    [
      where,
      "",
      "Zach wrote at 2026-10-03T14:05:00Z:",
      "Please check the build.",
      "",
      "Alex wrote at 2026-10-03T14:06:30Z:",
      "Two lines,",
      "and a blank one below.",
      "",
      "",
      "Zach wrote at 2026-10-03T14:09:00Z:",
      "Never mind the first one.",
    ].join("\n"),
  );
});

test("the thread and channel are said once, however many messages there are", () => {
  const prompt = promptFor(
    outstanding(snapshot("msg_3", "Zach", "c", "2026-10-03T14:09:00Z"), [
      snapshot("msg_1", "Zach", "a", "2026-10-03T14:05:00Z"),
      snapshot("msg_2", "Zach", "b", "2026-10-03T14:06:00Z"),
    ]),
  );

  assert.equal(prompt.split("th_4k9x2m7q0b3d").length - 1, 1);
  assert.equal(prompt.split("ch_8f2m1q7z4c0a").length - 1, 1);
});

test("the time is UTC whatever the machine's zone is", () => {
  const before = process.env.TZ;
  process.env.TZ = "Pacific/Auckland";
  try {
    const prompt = promptFor(outstanding(snapshot("msg_1", "Zach", "hi", "2026-12-31T23:59:59Z")));
    assert.equal(prompt, `${where}\n\nZach wrote at 2026-12-31T23:59:59Z:\nhi`);
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test("a message is kept as written: who, when and what, and where it stands in chat", () => {
  const message: Message = {
    id: "msg_7",
    seq: 7,
    channelId: "ch_1",
    threadId: "th_1",
    author: { id: "person:zach", kind: "person", name: "Zach" },
    text: "  indented, as typed\n",
    sentAt: 1_700_000_000_000,
    addressed: ["agent:scout"],
    receipts: [],
  };

  assert.deepEqual(snapshotOf(message), {
    id: "msg_7",
    seq: 7,
    author: "Zach",
    text: "  indented, as typed\n",
    sentAt: 1_700_000_000_000,
  });
});

test("any message reads the same way wherever it is shown: who wrote it, when, and the text untouched", () => {
  assert.equal(
    written({ author: "scout", sentAt: at("2026-10-03T14:05:22.999Z"), text: "  Done.\n" }),
    "scout wrote at 2026-10-03T14:05:22Z:\n  Done.\n",
  );
});
