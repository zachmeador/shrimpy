import assert from "node:assert/strict";
import { test } from "node:test";
import { localTime } from "../../lib/time/index.ts";
import type { Outstanding, Snapshot } from "./input.ts";
import { promptFor } from "./prompt.ts";

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
      `Zach wrote at ${localTime(at("2026-10-03T14:05:00Z"))}:`,
      "Please check the build.",
      "",
      `Alex wrote at ${localTime(at("2026-10-03T14:06:30Z"))}:`,
      "Two lines,",
      "and a blank one below.",
      "",
      "",
      `Zach wrote at ${localTime(at("2026-10-03T14:09:00Z"))}:`,
      "Never mind the first one.",
    ].join("\n"),
  );
});
