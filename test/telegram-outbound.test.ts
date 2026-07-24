import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  renderTelegramTextChunks,
  TELEGRAM_TEXT_CHUNK_LIMIT,
} from "../dist/surfaces/telegram/format.js";
import {
  sendTelegramChannelMessage,
  sendTelegramPublicationText,
  sendTelegramFormattedText,
} from "../dist/surfaces/telegram/outbound.js";
import { makeMessage } from "../dist/channels/protocol.js";
import { textContent } from "../dist/channels/messages.js";

describe("telegram outbound formatting", () => {
  test("renders common markdown into Telegram HTML", () => {
    const chunks = renderTelegramTextChunks("**Bold** and `code` with [docs](https://example.com).");
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], {
      text: '<b>Bold</b> and <code>code</code> with <a href="https://example.com">docs</a>.',
      parseMode: "HTML",
    });
  });

  test("wraps standalone file references to avoid Telegram auto-link junk", () => {
    const chunks = renderTelegramTextChunks("Check README.md and src/cli.ts.");
    assert.equal(chunks.length, 1);
    assert.match(chunks[0]?.text ?? "", /<code>README\.md<\/code>/);
    assert.match(chunks[0]?.text ?? "", /<code>src\/cli\.ts<\/code>/);
  });

  test("chunks long formatted text while preserving tags", () => {
    const chunks = renderTelegramTextChunks(`**${"A".repeat(TELEGRAM_TEXT_CHUNK_LIMIT + 500)}**`);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.parseMode === "HTML"));
    assert.ok(chunks.every((chunk) => chunk.text.length <= TELEGRAM_TEXT_CHUNK_LIMIT));
    assert.ok(chunks.every((chunk) => chunk.text.startsWith("<b>")));
    assert.ok(chunks.every((chunk) => chunk.text.endsWith("</b>")));
  });

  test("falls back to plain text when Telegram rejects formatted HTML", async () => {
    const sent: Array<{ text: string; parseMode?: string }> = [];

    await sendTelegramFormattedText(
      {
        async sendMessage(_chatId, text, parseMode) {
          sent.push({ text, parseMode });
          if (parseMode === "HTML") {
            throw new Error("Bad Request: can't parse entities");
          }
        },
      },
      42,
      "**Bold**",
    );

    assert.deepEqual(sent, [
      { text: "<b>Bold</b>", parseMode: "HTML" },
      { text: "**Bold**", parseMode: undefined },
    ]);
  });

  test("sends low-urgency notifications silently", async () => {
    const sent: Array<{ text: string; options?: any }> = [];

    await sendTelegramPublicationText(
      {
        async sendMessage(_chatId, text, options) {
          sent.push({ text, options });
        },
      },
      42,
      "Plan updated.",
      { kind: "notify", urgency: "low" },
    );

    assert.deepEqual(sent, [{
      text: "Plan updated.",
      options: {
        parseMode: "HTML",
        disableNotification: true,
      },
    }]);
  });

  test("leaves default-agent messages visually unchanged", async () => {
    const sent: Array<{ text: string; options?: any }> = [];
    const message = makeMessage({
      sender: { kind: "agent", actorId: "agent:shrimpy" },
      origin: { transport: "internal" },
      content: textContent("Routine reply."),
    });

    await sendTelegramChannelMessage(
      {
        async sendMessage(_chatId, text, options) {
          sent.push({ text, options });
        },
        async sendPhoto() {},
      },
      42,
      message,
      "shrimpy",
    );

    assert.deepEqual(sent, [{
      text: "Routine reply.",
      options: "HTML",
    }]);
  });

  test("labels a non-default agent with its display name without changing stored text", async () => {
    const sent: Array<{ text: string; options?: any }> = [];
    const message = makeMessage({
      sender: {
        kind: "agent",
        actorId: "agent:mechanic",
        displayName: "Ole *Scrappy*",
      },
      origin: { transport: "internal" },
      content: textContent("Audit complete."),
    });

    await sendTelegramChannelMessage(
      {
        async sendMessage(_chatId, text, options) {
          sent.push({ text, options });
        },
        async sendPhoto() {},
      },
      42,
      message,
      "shrimpy",
    );

    assert.deepEqual(sent, [{
      text: "📨 <b>Message from Ole *Scrappy*</b>\n\nAudit complete.",
      options: "HTML",
    }]);
    assert.deepEqual(message.content.data, { text: "Audit complete." });
  });

  test("falls back to the exact non-default actor id", async () => {
    const sent: string[] = [];
    const message = makeMessage({
      sender: { kind: "agent", actorId: "agent:mechanic" },
      origin: { transport: "internal" },
      content: textContent("Maintenance report."),
    });

    await sendTelegramChannelMessage(
      {
        async sendMessage(_chatId, text) {
          sent.push(text);
        },
        async sendPhoto() {},
      },
      42,
      message,
      "shrimpy",
    );

    assert.deepEqual(sent, [
      "📨 <b>Message from agent:mechanic</b>\n\nMaintenance report.",
    ]);
  });
});
