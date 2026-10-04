import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import type { Channel, ChatClient, Thread } from "../../contracts/chat/index.ts";
import type { Io } from "../io/index.ts";
import { agentNamed, type Reached, reachChat, runningAgent, type Waited, waitForReceipt } from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import type { Command } from "./command.ts";

/** The exit code for a message nobody answered because work was stopped, or because the wait was, as a shell reports an interrupted command. */
const CANCELLED = 130;

const run: Command = {
  name: "run",
  usage: '<agent> "<text>" [--thread <id>] [--no-wait]',
  summary: "Say something to an agent and print its reply.",
  details:
    "Posts the text in your DM with the agent, to a new thread unless --thread names one, and waits for the " +
    "agent's receipt on it. When the agent answered, its reply is printed and the exit code is 0; a silent " +
    "agent prints nothing and exits 0; a failure prints its reason on standard error and exits 1; stopped or " +
    "skipped work says so and exits 130. A new thread's ID is printed on standard error. --no-wait exits 0 " +
    "once the message is posted, and prints its IDs. Stopping the command while it waits leaves the message and " +
    "the agent's work alone, and exits 130.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: { thread: { type: "string" }, "no-wait": { type: "boolean" } },
        allowPositionals: true,
      }),
    );
    const [agent, text] = expectArguments(positionals, ["<agent>", "<text>"]);
    if (text.trim() === "") throw new UsageError("The text is empty.");
    return say(io, { agent, text, thread: values.thread, wait: values["no-wait"] !== true });
  },
};

interface Request {
  agent: string;
  text: string;
  /** The thread to post in, or undefined for a new one. */
  thread: string | undefined;
  wait: boolean;
}

/** How far the message got, for saying what stopping the command left. */
type Progress = { stage: "reaching" } | { stage: "sending" } | { stage: "waiting"; thread: string };

async function say(io: Io, request: Request): Promise<number> {
  const stopped = new AbortController();
  const stopListening = io.onStop(() => stopped.abort());
  const { signal } = stopped;
  // Ended by the chat server going away, which nothing else would notice while waiting for a receipt.
  const lost = new AbortController();
  let progress: Progress = { stage: "reaching" };
  let reached: Reached | undefined;
  try {
    reached = await reachChat(io, signal);
    reached.connection.onDisconnect(() => lost.abort());
    const agent = agentNamed(reached.members, request.agent);
    const registered = runningAgent(reached.programs, agent);
    warnIfVersionDiffers(io, `the agent ${agent.name}`, registered.version);

    const { chat } = reached.connection;
    const dm = await chat.openDm(agent.id, signal);
    const thread = await chooseThread(chat, dm, request.thread, signal);
    progress = { stage: "sending" };
    const message = await chat.post(thread.id, request.text, randomUUID(), signal);
    progress = { stage: "waiting", thread: thread.id };
    if (!request.wait) {
      io.out(`Posted ${message.id} in thread ${thread.id}. Read it with: shrimpy read ${thread.id}`);
      return 0;
    }
    if (request.thread === undefined) {
      io.err(`Thread ${thread.id} started. Continue it with: shrimpy run ${request.agent} "<text>" --thread ${thread.id}`);
    }
    const watched = await reached.connection.attach(thread.id);
    const waiting = AbortSignal.any([signal, lost.signal]);
    const waited = await waitForReceipt(watched, message, agent.id, waiting);
    return report(io, request.agent, thread.id, waited);
  } catch (error) {
    if (signal.aborted) return interrupted(io, request.agent, progress);
    if (lost.signal.aborted) throw new Error(lostConnection(request.agent, progress), { cause: error });
    throw error;
  } finally {
    // A second stop request ends the command at once, while the connection is let go.
    stopListening();
    await reached?.close();
  }
}

/** A new thread in the DM, or the one that was asked for, which must be in the DM. */
async function chooseThread(
  chat: ChatClient,
  dm: Channel,
  id: string | undefined,
  signal: AbortSignal,
): Promise<Thread> {
  if (id === undefined) return chat.createThread(dm.id, null, signal);
  const found = (await chat.threads(dm.id, signal)).find((thread) => thread.id === id);
  if (found === undefined) {
    throw new Error(`There is no thread ${id} in your DM with ${dm.name}. List yours with: shrimpy threads ${dm.name}`);
  }
  return found;
}

/** Say what became of the message: the reply on standard output, anything else on standard error. */
function report(io: Io, agent: string, thread: string, waited: Waited): number {
  if (waited.kind === "moved-on") {
    io.err(
      `The thread has moved on past your message, so what ${agent} did with it can't be followed from here. ` +
        `Read the thread with: shrimpy read ${thread}`,
    );
    return 1;
  }
  const { receipt, reply } = waited;
  switch (receipt.status) {
    case "answered":
      if (reply === undefined) {
        io.err(`${agent} answered, but its reply ${receipt.reply} is not in the thread. Read it with: shrimpy read ${thread}`);
        return 1;
      }
      io.out(reply.text.replace(/\n$/, ""));
      return 0;
    case "silent":
      return 0;
    case "failed":
      io.err(`${agent} failed: ${receipt.detail}`);
      return 1;
    case "stopped":
      io.err(`${agent} stopped before answering your message.`);
      return CANCELLED;
    case "skipped":
      io.err(`${agent} skipped your message.`);
      return CANCELLED;
  }
}

/** The chat server went away: say what became of the message, as far as that is known. */
function lostConnection(agent: string, progress: Progress): string {
  const lost = "Lost the connection to the chat server";
  switch (progress.stage) {
    case "reaching":
      return `${lost}. Nothing was sent.`;
    case "sending":
      return `${lost} while your message was being sent. It may have been posted; check with: shrimpy threads ${agent}`;
    case "waiting":
      return `${lost}. Your message is in thread ${progress.thread}; read the thread with: shrimpy read ${progress.thread}`;
  }
}

/** The person stopped the command: say what that left, which is the message and the agent's work as they were. */
function interrupted(io: Io, agent: string, progress: Progress): number {
  switch (progress.stage) {
    case "reaching":
      io.err("Stopped before anything was sent.");
      break;
    case "sending":
      io.err(
        `Stopped while your message was being sent. It may have been posted; check with: shrimpy threads ${agent}`,
      );
      break;
    case "waiting":
      io.err(
        `Stopped waiting. Your message is in thread ${progress.thread}, and ${agent}'s work on it goes on. ` +
          `Read the thread with: shrimpy read ${progress.thread}`,
      );
      break;
  }
  return CANCELLED;
}

export const runCommands: Command[] = [run];
