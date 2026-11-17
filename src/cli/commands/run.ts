import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { type Channel, receiptWords, Thread } from "../../contracts/chat/index.ts";
import { contextOf, isLost, unlessRefused, valueOf } from "../../contracts/gateway/index.ts";
import { asSentence } from "../../lib/text/index.ts";
import type { Io } from "../io/index.ts";
import {
  agentNamed,
  type HeldThread,
  onChannel,
  type Reached,
  reachChat,
  runningAgent,
  type Waited,
  waitForReceipt,
} from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import { warnIfVersionDiffers } from "../versions/index.ts";
import { CANCELLED, type Command } from "./command.ts";

const run: Command = {
  name: "run",
  usage: '<agent> "<text>" [--thread <id>] [--no-wait]',
  summary: "Say something to an agent and print its reply.",
  details:
    "Posts the text in your DM with the agent, to a new thread unless --thread names one, and waits for the " +
    "agent's receipt on it. When the agent answered, its reply is printed and the exit code is 0; a silent " +
    "agent prints nothing and exits 0; a failure, or a message skipped because the turn ahead of it failed, " +
    "prints the reason on standard error and exits 1; work that was stopped, or a message a stop skipped, says " +
    "so and exits 130. A new thread's ID is printed on standard error. --no-wait exits 0 once the message is " +
    "posted, and prints its IDs. Stopping the command while it waits leaves the message and the agent's work " +
    "alone, and exits 130.",
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
  // Ended by the link to the gateway or chat going away, which nothing else would notice while waiting for a receipt.
  const lost = new AbortController();
  let progress: Progress = { stage: "reaching" };
  let reached: Reached | undefined;
  let held: HeldThread | undefined;
  try {
    reached = await reachChat(io, signal);
    void reached.client.closed.then(() => lost.abort());
    const agent = agentNamed(reached.members, request.agent);
    const linked = runningAgent(reached.programs, agent);
    warnIfVersionDiffers(io, `the agent ${agent.name}`, linked.shrimpy);

    const dm = valueOf(await reached.chat.openDm({ member: agent.id }, contextOf(signal)));
    const threadId = await chooseThread(reached, dm, request.thread, signal);
    held = await reached.client.host.get(Thread, { thread: threadId }, contextOf(signal));
    unlessRefused(held.refusal.value);
    whenFailed(held, () => lost.abort());
    progress = { stage: "sending" };
    const message = valueOf(await held.post({ text: request.text, request: randomUUID() }, contextOf(signal)));
    progress = { stage: "waiting", thread: threadId };
    if (!request.wait) {
      io.out(`Posted ${message.id} in thread ${threadId}. Read it with: shrimpy read ${threadId}`);
      return 0;
    }
    if (request.thread === undefined) {
      io.err(`Thread ${threadId} started. Continue it with: shrimpy run ${request.agent} "<text>" --thread ${threadId}`);
    }
    const waited = await waitForReceipt(held, message, agent.id, AbortSignal.any([signal, lost.signal]));
    return report(io, request.agent, threadId, waited);
  } catch (error) {
    if (signal.aborted) return interrupted(io, request.agent, progress);
    if (lost.signal.aborted || (progress.stage !== "reaching" && isLost(error))) {
      throw new Error(lostConnection(request.agent, progress), { cause: error });
    }
    throw error;
  } finally {
    // A second stop request ends the command at once, while the link is let go.
    stopListening();
    held?.release();
    await reached?.close();
  }
}

/** Call `lost` once `held` fails, as a thread does when chat goes away, which a link to the gateway that holds keeps quiet about. */
function whenFailed(held: HeldThread, lost: () => void): void {
  void held.state.watch(contextOf()).then((watch) => {
    watch.start(async (call) => {
      if (call.kind === "value" && call.value.kind === "failed") lost();
    });
  });
}

/** A new thread in the DM, or the one that was asked for, which must be in the DM. */
async function chooseThread(reached: Reached, dm: Channel, id: string | undefined, signal: AbortSignal): Promise<string> {
  return onChannel(
    reached.client,
    dm.id,
    async (channel) => {
      if (id === undefined) return valueOf(await channel.createThread({ name: null }, contextOf(signal))).id;
      if (!channel.threads.value.some((thread) => thread.id === id)) {
        throw new Error(`There is no thread ${id} in your DM with ${dm.name}. List yours with: shrimpy threads ${dm.name}`);
      }
      return id;
    },
    signal,
  );
}

/**
 * Say what became of the message: the reply on standard output, anything else on standard error. What a failed,
 * stopped or skipped receipt tells a person is said in the contract's words, as a sentence.
 */
function report(io: Io, agent: string, thread: string, waited: Waited): number {
  if (waited.kind === "moved-on") {
    io.err(
      `The thread has moved on past your message, so what ${agent} did with it can't be followed from here. ` +
        `Read the thread with: shrimpy read ${thread}`,
    );
    return 1;
  }
  const { receipt, reply } = waited;
  const said = receiptWords(receipt, agent);
  if (said !== undefined) {
    io.err(asSentence(said));
    // A skipped receipt with a reason was left behind a turn that failed, and one with none behind a stop.
    const failed = receipt.status === "failed" || (receipt.status === "skipped" && receipt.detail !== null);
    return failed ? 1 : CANCELLED;
  }
  if (receipt.status === "silent") return 0;
  if (reply === undefined) {
    io.err(`${agent} answered, but its reply ${receipt.reply} is not in the thread. Read it with: shrimpy read ${thread}`);
    return 1;
  }
  io.out(reply.text.replace(/\n$/, ""));
  return 0;
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
