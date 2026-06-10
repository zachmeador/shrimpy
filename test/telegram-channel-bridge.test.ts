import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TelegramChannelBridge } from "../dist/surfaces/telegram/bridge.js";
import { formatChannelMessage } from "../dist/context/index.js";
import { ChannelBus } from "../dist/channels/bus.js";
import { ChannelMembershipStore } from "../dist/channels/membership.js";
import { IdentityStore } from "../dist/gateway/identity-store.js";
import { SurfaceThreadStateStore } from "../dist/surfaces/shared/thread-state-store.js";
import { UserPresenceStore } from "../dist/surfaces/shared/user-presence.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-telegram-bridge-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function createBridge(overrides?: {
  defaultAgentId?: string;
  knownAgentIds?: string[];
  threadStateStore?: SurfaceThreadStateStore;
  channelMemberships?: ChannelMembershipStore;
  userPresenceStore?: UserPresenceStore;
  sent?: Array<{ chatId: number; text: string; parseMode?: string }>;
  textBurstWindowMs?: number;
  mediaGroupWindowMs?: number;
  users?: Record<string, { userId: string; actorId: string; displayName?: string }>;
}) {
  const channelsDir = join(testDir, "channels");
  const mediaDir = join(testDir, "media");
  mkdirSync(channelsDir, { recursive: true });
  mkdirSync(mediaDir, { recursive: true });
  const channelBus = new ChannelBus(channelsDir);
  const sent = overrides?.sent ?? [];

  const bridge = new TelegramChannelBridge(
    {
      channelBus,
      mediaDir,
      identityStore: new IdentityStore(join(testDir, "users.json")),
      surfaceId: "telegram.main",
      channelPrefix: "telegram~main~",
      defaultAgentId: overrides?.defaultAgentId ?? "shrimpy",
      knownAgentIds: overrides?.knownAgentIds ?? ["shrimpy", "career"],
      threadStateStore:
        overrides?.threadStateStore
        ?? new SurfaceThreadStateStore(join(testDir, "surface-state.json")),
      channelMemberships: overrides?.channelMemberships,
      userPresenceStore: overrides?.userPresenceStore,
      users: overrides?.users,
      textBurstWindowMs: overrides?.textBurstWindowMs,
      mediaGroupWindowMs: overrides?.mediaGroupWindowMs,
    },
    {
      async downloadFileById(fileId: string) {
        return {
          filePath: `${fileId}.jpg`,
          data: Buffer.from(fileId),
        };
      },
      async sendMessage(chatId: number, text: string, parseMode?: string) {
        sent.push({ chatId, text, parseMode });
      },
    } as any,
  );

  return { bridge, channelBus, sent, mediaDir };
}

describe("TelegramChannelBridge", () => {
  test("uses configured stable human identity mappings", async () => {
    const { bridge, channelBus } = createBridge({
      users: {
        "7": {
          userId: "alice",
          actorId: "human:alice",
          displayName: "Alice",
        },
      },
    });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "hello",
      },
    });
    await bridge.flushPending();

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.actorId, "human:alice");
    assert.equal(messages[0].sender.userId, "alice");
    assert.equal(messages[0].sender.displayName, "Alice");
  });

  test("maps /new into a session reset control message", async () => {
    const { bridge, channelBus } = createBridge();

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/new",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.kind, "human");
    assert.deepEqual(messages[0].content, {
      type: "control",
      data: {
        kind: "session_reset",
        targetAgentId: "shrimpy",
        command: "/new",
      },
    });
  });

  test("switches the addressed agent with /agent and stamps later messages", async () => {
    const sent: Array<{ chatId: number; text: string; parseMode?: string }> = [];
    const { bridge, channelBus } = createBridge({ sent });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/agent career",
      },
    });

    await bridge.handleUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "hello there",
      },
    });
    await bridge.flushPending();

    assert.deepEqual(sent, [{
      chatId: 4242,
      text: "Switched this chat to <code>career</code>.",
      parseMode: "HTML",
    }]);

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 2);
    assert.deepEqual(messages[0].content, {
      type: "status",
      data: {
        kind: "surface_addressing",
        surface: "telegram.main",
        threadId: "4242",
        previousAgentId: "shrimpy",
        addressedAgentId: "career",
        joinedAgentId: null,
        source: "chat",
      },
    });
    assert.equal(messages[1].content.type, "text");
    assert.equal(messages[1].origin.addressedAgentId, "career");
  });

  test("/agent joins the selected agent to the Telegram channel", async () => {
    const memberships = new ChannelMembershipStore(
      join(testDir, "channels.json"),
      [{ id: "shrimpy" }, { id: "career" }] as any,
    );
    memberships.write({
      channels: {
        "telegram~main~4242": {
          agents: {
            shrimpy: {},
          },
        },
      },
    });
    const sent: Array<{ chatId: number; text: string; parseMode?: string }> = [];
    const { bridge, channelBus } = createBridge({ channelMemberships: memberships, sent });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/agent career",
      },
    });

    assert.deepEqual(memberships.listAgentIds("telegram~main~4242"), [
      "career",
      "shrimpy",
    ]);
    assert.deepEqual(sent, [{
      chatId: 4242,
      text: "Switched this chat to <code>career</code> and joined it to the channel.",
      parseMode: "HTML",
    }]);
    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "status");
    assert.equal((messages[0].content.data as any).joinedAgentId, "career");
  });

  test("records user presence for inbound Telegram chats", async () => {
    const presenceStore = new UserPresenceStore(join(testDir, "presence.json"));
    const { bridge } = createBridge({
      userPresenceStore: presenceStore,
      users: {
        "7": {
          userId: "alice",
          actorId: "human:alice",
          displayName: "Alice",
        },
      },
    });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "hello",
      },
    });
    await bridge.flushPending();

    const entry = presenceStore.get("alice");
    assert.equal(entry?.channel, "telegram~main~4242");
    assert.equal(entry?.surface, "telegram.main");
    assert.equal(entry?.transport, "telegram");
    assert.equal(entry?.transportChatId, "4242");
  });

  test("/new resets the currently addressed agent for that chat", async () => {
    const threadStateStore = new SurfaceThreadStateStore(join(testDir, "surface-state.json"));
    threadStateStore.setAddressedAgent("telegram.main", "4242", "career");
    const { bridge, channelBus } = createBridge({ threadStateStore });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/new",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].content, {
      type: "control",
      data: {
        kind: "session_reset",
        targetAgentId: "career",
        command: "/new",
      },
    });
  });

  test("maps /restore into a session restore control message", async () => {
    const { bridge, channelBus } = createBridge();

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/restore archive-2026-04-05",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].content, {
      type: "control",
      data: {
        kind: "session_restore",
        targetAgentId: "shrimpy",
        archiveName: "archive-2026-04-05",
        command: "/restore",
      },
    });
  });

  test("maps /stop into a session stop control message", async () => {
    const { bridge, channelBus } = createBridge();

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/stop",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].content, {
      type: "control",
      data: {
        kind: "session_stop",
        targetAgentId: "shrimpy",
        command: "/stop",
      },
    });
  });

  test("maps /thinking into a session thinking control message", async () => {
    const { bridge, channelBus } = createBridge();

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/thinking high",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].content, {
      type: "control",
      data: {
        kind: "session_thinking_level",
        targetAgentId: "shrimpy",
        level: "high",
        command: "/thinking",
      },
    });
  });

  test("/thinking targets the currently addressed agent for that chat", async () => {
    const threadStateStore = new SurfaceThreadStateStore(join(testDir, "surface-state.json"));
    threadStateStore.setAddressedAgent("telegram.main", "4242", "career");
    const { bridge, channelBus } = createBridge({ threadStateStore });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/thinking low",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].content, {
      type: "control",
      data: {
        kind: "session_thinking_level",
        targetAgentId: "career",
        level: "low",
        command: "/thinking",
      },
    });
  });

  test("/thinking on maps to medium in the session control message", async () => {
    const { bridge, channelBus } = createBridge();

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/thinking on",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].content, {
      type: "control",
      data: {
        kind: "session_thinking_level",
        targetAgentId: "shrimpy",
        level: "medium",
        command: "/thinking",
      },
    });
  });

  test("renders /thinking usage when no level is provided", async () => {
    const sent: Array<{ chatId: number; text: string; parseMode?: string }> = [];
    const { bridge, channelBus } = createBridge({ sent });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/thinking",
      },
    });

    assert.equal(sent.length, 1);
    assert.match(sent[0]?.text ?? "", /<code>\/thinking &lt;level&gt;<\/code>/);

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 0);
  });

  test("renders /help as formatted Telegram output without appending a channel message", async () => {
    const sent: Array<{ chatId: number; text: string; parseMode?: string }> = [];
    const { bridge, channelBus } = createBridge({ sent });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/help",
      },
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.chatId, 4242);
    assert.equal(sent[0]?.parseMode, "HTML");
    assert.match(sent[0]?.text ?? "", /<b>Shrimpy Telegram Commands<\/b>/);
    assert.match(sent[0]?.text ?? "", /<code>\/new<\/code>/);

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 0);
  });

  test("debounces rapid text bursts into one channel message", async () => {
    const { bridge, channelBus } = createBridge({ textBurstWindowMs: 20 });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "first chunk",
      },
    });

    await bridge.handleUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "second chunk",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 60));

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.text, "first chunk\nsecond chunk");
  });

  test("flushes a pending text burst before executing a command", async () => {
    const { bridge, channelBus } = createBridge({ textBurstWindowMs: 50 });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "queued text",
      },
    });

    await bridge.handleUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        text: "/new",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 2);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.text, "queued text");
    assert.deepEqual(messages[1].content, {
      type: "control",
      data: {
        kind: "session_reset",
        targetAgentId: "shrimpy",
        command: "/new",
      },
    });
  });

  test("coalesces Telegram media groups into one grouped image message", async () => {
    const { bridge, channelBus, mediaDir } = createBridge({ mediaGroupWindowMs: 20 });

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        media_group_id: "album-1",
        caption: "album caption",
        photo: [
          {
            file_id: "group-photo-a",
            file_unique_id: "group-photo-a-uniq",
            width: 10,
            height: 10,
          },
        ],
      },
    });

    await bridge.handleUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        media_group_id: "album-1",
        photo: [
          {
            file_id: "group-photo-b",
            file_unique_id: "group-photo-b-uniq",
            width: 10,
            height: 10,
          },
        ],
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 80));

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].content.type, "image_group");
    assert.equal(messages[0].content.data.caption, "album caption");
    assert.equal(messages[0].content.data.paths.length, 2);
    for (const path of messages[0].content.data.paths) {
      assert.equal(existsSync(path), true);
      assert.equal(path.startsWith(mediaDir), true);
    }
  });

  test("publishes unsupported document messages as structured surface descriptors", async () => {
    const { bridge, channelBus } = createBridge();

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        document: {
          file_id: "doc-1",
          file_unique_id: "doc-1-uniq",
          file_name: "notes.pdf",
        },
        caption: "read this",
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "unsupported_media");
    assert.deepEqual(messages[0].content.data, {
      mediaKind: "document",
      fileName: "notes.pdf",
      caption: "read this",
    });
    assert.match(
      formatChannelMessage("telegram~main~4242", messages[0]),
      /\[Document: notes\.pdf\]\nread this/,
    );
  });

  test("publishes Telegram location messages instead of dropping them", async () => {
    const { bridge, channelBus } = createBridge();

    await bridge.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 4242, type: "private" },
        from: { id: 7, is_bot: false, first_name: "Alice", username: "alice" },
        location: {
          latitude: 48.2082,
          longitude: 16.3738,
        },
      },
    });

    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content.type, "unsupported_media");
    assert.deepEqual(messages[0].content.data, {
      mediaKind: "location",
      latitude: 48.2082,
      longitude: 16.3738,
    });
    assert.match(
      formatChannelMessage("telegram~main~4242", messages[0]),
      /\[Location: 48\.2082, 16\.3738\]/,
    );
  });
});
