import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  renderTelegramTextChunks,
  sendTelegramFormattedText,
  TELEGRAM_TEXT_CHUNK_LIMIT,
} from "../dist/surfaces/telegram/outbound.js";

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
});
