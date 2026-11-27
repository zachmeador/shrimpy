import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { crc32, deflateSync } from "node:zlib";
import type { Message } from "@earendil-works/pi-ai";
import { localTime } from "../lib/time/index.ts";
import { callingTools, type Script, startAgentRig } from "./testing/index.ts";

const timeout = 60_000;

/** A real PNG, `width` by `height`, all one color, which a picture processor can decode. */
function aPng(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const sized = Buffer.alloc(4);
    sized.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc32(body));
    return Buffer.concat([sized, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7f)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]),
  );
}

test("a picture you send is saved in the agent's home and shown to the model after its message, and a file the agent attaches comes with its reply", { timeout }, async (t) => {
  const tools = callingTools([[{ name: "attach", args: { paths: ["notes/answer.txt"] } }]], "Here is what I found.");
  let shown: readonly Message[] = [];
  const script: Script = (messages, home) => {
    shown = messages;
    return tools.script(messages, home);
  };
  const rig = await startAgentRig(t, { script });
  mkdirSync(join(rig.home, "notes"));
  writeFileSync(join(rig.home, "notes", "answer.txt"), "forty-two\n");

  const picture = aPng(40, 30);
  const sent = await rig.send("what board is this?", [{ name: "board.png", mediaType: "image/png", bytes: picture }]);
  assert.deepEqual(
    sent.attachments.map(({ name, mediaType, width, height }) => ({ name, mediaType, width, height })),
    [{ name: "board.png", mediaType: "image/png", width: 40, height: 30 }],
  );
  assert.equal((await rig.receiptOn(sent)).status, "answered");

  const path = `attachments/${localTime(sent.sentAt).slice(0, 10)}/board.png`;
  assert.deepEqual(new Uint8Array(readFileSync(join(rig.home, path))), picture, "the picture is saved in the home under the day it was sent");
  const input = shown.find((message) => message.role === "user");
  assert.ok(input !== undefined && Array.isArray(input.content), "the input has words and a picture");
  const [words, image] = input.content;
  assert.ok(words?.type === "text" && words.text.includes(`Attached: ${path} in your home, image/png`), "the words say where the picture is");
  assert.ok(image?.type === "image", "the picture follows its message");

  assert.deepEqual(tools.answers.map(({ name, isError }) => ({ name, isError })), [{ name: "attach", isError: false }]);
  const [reply] = await rig.replies();
  assert.equal(reply?.text, "Here is what I found.");
  assert.deepEqual(
    reply.attachments.map(({ name, mediaType, size }) => ({ name, mediaType, size })),
    [{ name: "answer.txt", mediaType: "text/plain", size: 10 }],
  );
  const attached = reply.attachments[0];
  assert.ok(attached !== undefined);
  assert.equal(new TextDecoder().decode(await rig.download(attached)), "forty-two\n");
});
