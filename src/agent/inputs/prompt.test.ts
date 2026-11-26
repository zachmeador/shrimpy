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
  return { event, threadId: "th_4k9x2m7q0b3d", channelId: "ch_8f2m1q7z4c0a", earlier, missed: [] };
}

test("a message is shown with its thread and channel, after the earlier events, each as written, oldest first", () => {
  const earlier = [
    posted("evt_2", "Zach", "Please check the build.", "2026-10-03T14:05:00Z"),
    posted("evt_3", "Alex", "Two lines,\nand a blank one below.\n", "2026-10-03T14:06:30Z"),
  ];
  const latest = posted("evt_4", "Zach", "Never mind the first one.", "2026-10-03T14:09:00Z");

  const prompt = promptFor(outstanding(latest, earlier));

  assert.ok(prompt.includes("th_4k9x2m7q0b3d") && prompt.includes("ch_8f2m1q7z4c0a"), prompt);
  const where = [...earlier, latest].map((event) => (event.kind === "posted" ? prompt.indexOf(event.text) : -1));
  assert.ok(where.every((index) => index >= 0), "each is there as it was written");
  assert.deepEqual(where, where.toSorted((a, b) => a - b), "oldest first");
  for (const event of [...earlier, latest]) {
    assert.ok(event.kind === "posted" && prompt.includes(event.author) && prompt.includes(localTime(event.sentAt)), event.id);
  }
});
