import assert from "node:assert/strict";
import { test } from "node:test";
import { promptFor } from "./prompt.ts";
import type { Outstanding, Snapshot } from "./events.ts";

const at = (iso: string): number => Date.parse(iso);

function posted(id: string, author: string, text: string, sentAt: string): Snapshot {
  return { kind: "posted", id, seq: Number(id.slice(-1)), author, text, sentAt: at(sentAt) };
}

function outstanding(event: Snapshot, earlier: Snapshot[] = []): Outstanding {
  return { event, threadId: "th_4k9x2m7q0b3d", channelId: "ch_8f2m1q7z4c0a", earlier };
}

const where = "Thread th_4k9x2m7q0b3d in channel ch_8f2m1q7z4c0a.";

test("a message is shown with where it is, after the earlier events the agent has not acted on, each as written, oldest first", () => {
  const prompt = promptFor(
    outstanding(posted("evt_4", "Zach", "Never mind the first one.", "2026-10-03T14:09:00Z"), [
      posted("evt_2", "Zach", "Please check the build.", "2026-10-03T14:05:00Z"),
      posted("evt_3", "Alex", "Two lines,\nand a blank one below.\n", "2026-10-03T14:06:30Z"),
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

test("the time is UTC whatever the machine's zone is", () => {
  const before = process.env.TZ;
  process.env.TZ = "Pacific/Auckland";
  try {
    const prompt = promptFor(outstanding(posted("evt_1", "Zach", "hi", "2026-12-31T23:59:59Z")));
    assert.equal(prompt, `${where}\n\nZach wrote at 2026-12-31T23:59:59Z:\nhi`);
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
