import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendMessage,
  readMessages,
  makeMessage,
  channelPath,
  textContent,
  watchChannels,
  drainBacklog,
  loadCursors,
  saveCursors,
  type ChannelCursor,
} from "../dist/channels/index.js";

let testDir: string;

function humanText(label: string, text: string) {
  return makeMessage({
    sender: {
      kind: "human",
      actorId: `human:${label}`,
      userId: label,
      displayName: label,
    },
    origin: {
      transport: "test",
    },
    content: textContent(text),
  });
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("appendMessage + readMessages", () => {
  test("roundtrip: append then read", () => {
    const path = join(testDir, "test.jsonl");
    const msg = humanText("user-1", "hello");
    appendMessage(path, msg);

    const { messages, cursor } = readMessages(path);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.text, "hello");
    assert.equal(messages[0].sender.kind, "human");
    assert.ok(cursor.byteOffset > 0);
  });

  test("multiple appends, incremental reads", () => {
    const path = join(testDir, "test.jsonl");

    const msg1 = humanText("user-1", "one");
    const msg2 = humanText("user-1", "two");
    const msg3 = humanText("user-1", "three");

    appendMessage(path, msg1);
    appendMessage(path, msg2);

    // Read all
    const { messages: all, cursor: c1 } = readMessages(path);
    assert.equal(all.length, 2);

    // Append more
    appendMessage(path, msg3);

    // Read from cursor — only new message
    const { messages: incremental, cursor: c2 } = readMessages(path, c1);
    assert.equal(incremental.length, 1);
    assert.equal(incremental[0].content.type, "text");
    assert.equal(incremental[0].content.data.text, "three");
    assert.ok(c2.byteOffset > c1.byteOffset);
  });

  test("read from middle via cursor", () => {
    const path = join(testDir, "test.jsonl");

    for (let i = 0; i < 5; i++) {
      appendMessage(path, humanText("user-1", `msg-${i}`));
    }

    // Read first 2
    const { messages: first, cursor: c1 } = readMessages(path);
    assert.equal(first.length, 5);

    // Read from end cursor — nothing new
    const { messages: empty } = readMessages(path, c1);
    assert.equal(empty.length, 0);
  });

  test("empty/missing file returns empty", () => {
    const path = join(testDir, "nonexistent.jsonl");
    const { messages, cursor } = readMessages(path);
    assert.equal(messages.length, 0);
    assert.equal(cursor.byteOffset, 0);
  });

  test("partial line at EOF is not parsed", () => {
    const path = join(testDir, "test.jsonl");
    // Write a complete line
    const msg = humanText("user-1", "complete");
    appendMessage(path, msg);

    // Write an incomplete line (no newline, truncated JSON)
    appendFileSync(path, '{"id":"partial","from":"user","type":"text"', "utf-8");

    const { messages } = readMessages(path);
    // Should only get the complete message
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.text, "complete");
  });

  test("skips parsed lines that are not valid channel messages", () => {
    const path = join(testDir, "test.jsonl");
    appendFileSync(
      path,
      JSON.stringify({
        id: "legacy",
        from: "system",
        type: "system",
        payload: { note: "old format" },
        timestamp: Date.now(),
      }) + "\n",
      "utf-8",
    );
    appendMessage(path, humanText("user-1", "current"));

    const { messages, cursor } = readMessages(path);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.text, "current");
    assert.ok(cursor.byteOffset > 0);
  });

  test("cursor tracks byte offset correctly across unicode", () => {
    const path = join(testDir, "test.jsonl");
    const msg = humanText("user-1", "hello 🦐 world");
    appendMessage(path, msg);

    const { cursor: c1 } = readMessages(path);

    const msg2 = humanText("user-1", "after emoji");
    appendMessage(path, msg2);

    const { messages, cursor: c2 } = readMessages(path, c1);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.text, "after emoji");
    assert.ok(c2.byteOffset > c1.byteOffset);
  });

  test("resets a stale cursor when the channel file shrinks", () => {
    const path = join(testDir, "test.jsonl");
    appendMessage(path, humanText("user-1", "before reset"));
    const { cursor } = readMessages(path);

    writeFileSync(path, "", "utf-8");
    appendMessage(path, humanText("user-1", "after reset"));

    const { messages, cursor: updated } = readMessages(path, cursor);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.text, "after reset");
    assert.ok(updated.byteOffset > 0);
  });

  test("recovers when a persisted cursor points inside a rewritten line", () => {
    const path = join(testDir, "test.jsonl");
    appendMessage(path, humanText("user-1", "old longer message"));
    const { cursor } = readMessages(path);

    writeFileSync(path, "", "utf-8");
    appendMessage(path, humanText("user-1", "one"));
    appendMessage(path, humanText("user-1", "two"));

    const { messages, cursor: updated } = readMessages(path, {
      byteOffset: Math.min(cursor.byteOffset, 10),
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.text, "two");
    assert.ok(updated.byteOffset > 10);
  });
});

describe("channel names", () => {
  test("accepts current channel naming conventions", () => {
    assert.equal(channelPath(testDir, "home"), join(testDir, "home.jsonl"));
    assert.equal(
      channelPath(testDir, "telegram~main~123"),
      join(testDir, "telegram~main~123.jsonl"),
    );
    assert.equal(
      channelPath(testDir, "dm~agent-a~agent_b"),
      join(testDir, "dm~agent-a~agent_b.jsonl"),
    );
    assert.equal(
      channelPath(testDir, "work.logs_1"),
      join(testDir, "work.logs_1.jsonl"),
    );
  });

  test("rejects traversal and malformed channel names", () => {
    for (const channel of [
      "../outside",
      "..",
      "home/child",
      "home\\child",
      "home child",
      "Telegram~Main~123",
      "user:alice",
      "home\nnext",
    ]) {
      assert.throws(
        () => channelPath(testDir, channel),
        /invalid channel name/,
        channel,
      );
    }
  });
});

describe("cursor persistence", () => {
  test("save and load cursors", () => {
    const cursorsPath = join(testDir, "cursors.json");
    const cursors: Record<string, ChannelCursor> = {
      "telegram-123": { byteOffset: 456 },
      maintenance: { byteOffset: 789 },
    };

    saveCursors(cursorsPath, cursors);
    const loaded = loadCursors(cursorsPath);

    assert.deepEqual(loaded, cursors);
  });

  test("load missing file returns empty", () => {
    const loaded = loadCursors(join(testDir, "nope.json"));
    assert.deepEqual(loaded, {});
  });
});

describe("drainBacklog", () => {
  test("drains all channels from cursors", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    const path1 = channelPath(channelsDir, "chan1");
    const path2 = channelPath(channelsDir, "chan2");

    appendMessage(path1, humanText("user-1", "a"));
    appendMessage(path1, humanText("user-1", "b"));
    appendMessage(path2, humanText("user-2", "c"));

    const received: Array<{ channel: string; messages: any[] }> = [];
    const updated = drainBacklog(channelsDir, {}, (channel, messages) => {
      received.push({ channel, messages });
    });

    assert.equal(received.length, 2);

    const chan1 = received.find((r) => r.channel === "chan1")!;
    assert.equal(chan1.messages.length, 2);

    const chan2 = received.find((r) => r.channel === "chan2")!;
    assert.equal(chan2.messages.length, 1);

    // Updated cursors should be at end of files
    assert.ok(updated["chan1"].byteOffset > 0);
    assert.ok(updated["chan2"].byteOffset > 0);
  });

  test("drains only new messages when cursors provided", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    const path = channelPath(channelsDir, "test");
    appendMessage(path, humanText("user-1", "old"));

    // Get cursor after first message
    const { cursor } = readMessages(path);

    appendMessage(path, humanText("user-1", "new"));

    const received: any[] = [];
    drainBacklog(channelsDir, { test: cursor }, (channel, messages) => {
      received.push(...messages);
    });

    assert.equal(received.length, 1);
    assert.equal(received[0].content.type, "text");
    assert.equal(received[0].content.data.text, "new");
  });
});

describe("watchChannels", () => {
  test("initial drain processes messages that already exist when watching starts", async () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    const path = channelPath(channelsDir, "startup");
    appendMessage(path, humanText("user-1", "existing msg"));

    const received: Array<{ channel: string; messages: any[] }> = [];
    const watcher = watchChannels(channelsDir, (channel, messages) => {
      received.push({ channel, messages });
    });

    try {
      await new Promise((r) => setTimeout(r, 50));

      const entry = received.find((r) => r.channel === "startup");
      assert.ok(entry, "should drain existing channel contents on startup");
      assert.equal(entry!.messages[0].content.type, "text");
      assert.equal(entry!.messages[0].content.data.text, "existing msg");

      const cursors = watcher.getCursors();
      assert.ok(cursors["startup"], "should expose cursor for drained channel");
      assert.ok(cursors["startup"].byteOffset > 0, "cursor should advance");
    } finally {
      watcher.stop();
    }
  });

  test("detects new messages on existing channel", async () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    const received: Array<{ channel: string; messages: any[] }> = [];

    const watcher = watchChannels(channelsDir, (channel, messages) => {
      received.push({ channel, messages });
    });

    try {
      // Write a message after watcher starts
      await new Promise((r) => setTimeout(r, 100)); // Let watcher settle
      const path = channelPath(channelsDir, "live");
      appendMessage(path, humanText("user-1", "live msg"));

      // Wait for fs.watch to fire
      await new Promise((r) => setTimeout(r, 500));

      assert.ok(received.length > 0, "should have received at least one callback");
      const entry = received.find((r) => r.channel === "live");
      assert.ok(entry, "should have received message on 'live' channel");
      assert.equal(entry!.messages[0].content.type, "text");
      assert.equal(entry!.messages[0].content.data.text, "live msg");

      // Verify authoritative cursors
      const cursors = watcher.getCursors();
      assert.ok(cursors["live"], "should have cursor for 'live' channel");
      assert.ok(cursors["live"].byteOffset > 0, "cursor should be past 0");
    } finally {
      watcher.stop();
    }
  });
});
