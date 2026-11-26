import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall, type Message, type ToolResultMessage } from "@earendil-works/pi-ai";
import { eventually, waitForView } from "../lib/testing/index.ts";
import { assistantItems, startAgentRig } from "./testing/index.ts";

const timeout = 40_000;

function textOf(message: Message | undefined): string {
  if (message?.role !== "user") return "";
  return typeof message.content === "string"
    ? message.content
    : message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

function resultText(messages: readonly Message[]): string {
  const last = messages.at(-1);
  if (last?.role !== "toolResult") return "";
  return (last as ToolResultMessage).content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

test("posting to another agent's DM automatically watches and wakes the calling thread with an answer wake line", { timeout }, async (t) => {
  let mayaGate = (): void => undefined;
  const holdMaya = new Promise<void>((resolve) => {
    mayaGate = resolve;
  });

  const scoutTold: string[] = [];
  const scout = await startAgentRig(t, {
    name: "scout",
    tokensPerSecond: 1_000_000,
    script: (messages) => {
      const user = textOf(messages.findLast((m) => m.role === "user"));
      const lastTool = resultText(messages);
      if (user.includes("ask maya")) {
        if (lastTool === "") {
          return fauxAssistantMessage(
            [fauxToolCall("post", { to: "@maya", text: "Fetch the latest ROMs." }, { id: "c1" })],
            { stopReason: "toolUse" },
          );
        }
        return fauxAssistantMessage("Asked maya.");
      }
      if (user.includes("Synced 12 ROMs")) {
        scoutTold.push(user);
        const match = /th_[0-9a-z]{12}/.exec(user);
        if (lastTool === "" && match !== null) {
          return fauxAssistantMessage(
            [fauxToolCall("thread", { action: "archive", thread: match[0] }, { id: "c2" })],
            { stopReason: "toolUse" },
          );
        }
        return fauxAssistantMessage("Maya synced 12 ROMs and I archived the DM thread.");
      }
      return fauxAssistantMessage("Ok.");
    },
  });
  await startAgentRig(t, {
    name: "maya",
    chat: scout.chat,
    tokensPerSecond: 1_000_000,
    script: async () => {
      await holdMaya;
      return fauxAssistantMessage("Synced 12 ROMs.");
    },
  });

  const connection = await scout.connect();
  await scout.receiptOn(await scout.say("ask maya to sync"));

  // While maya is working, scout has one live watch visible on Agent.watches.
  const open = await eventually(() => connection.watches(), (list) => list.length === 1, { what: "open watch to be listed" });
  const first = open[0];
  assert.ok(first);
  assert.equal(first.fromThread, scout.thread.id);
  assert.equal(first.onAgentName, "maya");

  mayaGate();

  // Answer wake line lands in scout's thread and scout wakes, archives the DM, and reports back.
  const wake = await eventually(
    async () => (await scout.said()).find((m) => m.wake?.kind === "answer"),
    (found) => found !== undefined,
    { what: "the answer wake line" },
  );
  assert.ok(wake?.wake?.kind === "answer");
  assert.equal(wake.wake.from.name, "maya");
  assert.equal(wake.wake.status, "answered");
  assert.equal(wake.wake.thread, open[0]!.toThread);

  await eventually(
    async () => (await scout.replies()).some((m) => m.text.includes("Maya synced 12 ROMs")),
    (done) => done,
    { what: "scout to report back after maya settled" },
  );
  assert.equal((await connection.watches()).length, 0);
  assert.ok(scoutTold[0]?.includes("Synced 12 ROMs"));
});

test("fan-out to two agents reports still-pending watches on the first wakeup, and archiving or cancelWatch drops an open watch", { timeout }, async (t) => {
  let releaseCrab = (): void => undefined;
  const holdCrab = new Promise<void>((resolve) => {
    releaseCrab = resolve;
  });
  let releaseGame = (): void => undefined;
  const holdGame = new Promise<void>((resolve) => {
    releaseGame = resolve;
  });

  const wakeupInputs: string[] = [];
  const scout = await startAgentRig(t, {
    name: "scout",
    tokensPerSecond: 1_000_000,
    script: (messages) => {
      const user = textOf(messages.findLast((m) => m.role === "user"));
      const results = messages.slice(messages.findLastIndex((m) => m.role === "user") + 1).filter((m) => m.role === "toolResult");
      if (user.includes("update both")) {
        if (results.length === 0) {
          return fauxAssistantMessage([fauxToolCall("post", { to: "@crab", text: "Update now." }, { id: "c1" })], { stopReason: "toolUse" });
        }
        if (results.length === 1) {
          return fauxAssistantMessage([fauxToolCall("post", { to: "@game", text: "Update now." }, { id: "c2" })], { stopReason: "toolUse" });
        }
        return fauxAssistantMessage("Asked both.");
      }
      if (user.includes("@crab answered")) {
        wakeupInputs.push(user);
        return fauxAssistantMessage("END");
      }
      return fauxAssistantMessage("Ok.");
    },
  });
  await startAgentRig(t, {
    name: "crab",
    chat: scout.chat,
    tokensPerSecond: 1_000_000,
    script: async () => {
      await holdCrab;
      return fauxAssistantMessage("Crab updated.");
    },
  });
  await startAgentRig(t, {
    name: "game",
    chat: scout.chat,
    tokensPerSecond: 1_000_000,
    script: async () => {
      await holdGame;
      return fauxAssistantMessage("Game updated.");
    },
  });

  const connection = await scout.connect();
  await scout.receiptOn(await scout.say("update both"));
  const two = await eventually(() => connection.watches(), (list) => list.length === 2, { what: "both watches to open" });
  const gameWatch = two.find((w) => w.onAgentName === "game");
  assert.ok(gameWatch);

  // First agent answers; scout's wakeup includes `Still waiting on: @game (...)` and scout replies END.
  releaseCrab();
  await eventually(() => wakeupInputs.length, (n) => n === 1, { what: "crab wakeup to arrive" });
  assert.ok(wakeupInputs[0]?.includes("Still waiting on: @game"), wakeupInputs[0] ?? "");

  // Dismissing the second watch via Agent.cancelWatch drops it silently.
  await connection.cancelWatch(gameWatch.id);
  await eventually(() => connection.watches(), (list) => list.length === 0, { what: "game watch to be cancelled" });
  releaseGame();
});

test("/stop leaves open watches intact, and thread(archive) drops an open watch", { timeout }, async (t) => {
  let releaseMaya = (): void => undefined;
  const holdMaya = new Promise<void>((resolve) => {
    releaseMaya = resolve;
  });

  let dmThreadId = "";
  const scout = await startAgentRig(t, {
    name: "scout",
    tokensPerSecond: 40,
    script: (messages) => {
      const user = textOf(messages.findLast((m) => m.role === "user"));
      const lastTool = resultText(messages);
      if (user.includes("ping maya")) {
        if (lastTool === "") {
          return fauxAssistantMessage([fauxToolCall("post", { to: "@maya", text: "Hold on." }, { id: "c1" })], { stopReason: "toolUse" });
        }
        const match = /th_[0-9a-z]{12}/.exec(lastTool);
        if (match) dmThreadId = match[0];
        return fauxAssistantMessage("Pinged maya.");
      }
      if (user.includes("stream long")) {
        return fauxAssistantMessage(Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"));
      }
      if (user.includes("drop by archive")) {
        if (lastTool === "") {
          return fauxAssistantMessage([fauxToolCall("thread", { action: "archive", thread: dmThreadId }, { id: "c2" })], { stopReason: "toolUse" });
        }
        return fauxAssistantMessage("Archived.");
      }
      return fauxAssistantMessage("Ok.");
    },
  });
  await startAgentRig(t, {
    name: "maya",
    chat: scout.chat,
    tokensPerSecond: 1_000_000,
    script: async () => {
      await holdMaya;
      return fauxAssistantMessage("Done.");
    },
  });

  const connection = await scout.connect();
  await scout.receiptOn(await scout.say("ping maya"));
  await eventually(() => connection.watches(), (list) => list.length === 1, { what: "watch to open" });

  // /stop stops the running turn without dropping the watch.
  await scout.say("stream long");
  const { session } = await scout.attach();
  await waitForView(session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 10);
  await session.stop();
  assert.equal((await connection.watches()).length, 1, "/stop keeps open watches");

  // Archiving the watched DM thread drops the watch cleanly.
  await scout.receiptOn(await scout.say("drop by archive"));
  await eventually(() => connection.watches(), (list) => list.length === 0, { what: "archiving DM thread to drop the watch" });
  releaseMaya();
});
