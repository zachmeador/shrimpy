import { parseArgs } from "node:util";
import type { SessionHandle, Settlement } from "../../contracts/agent/index.ts";
import type { Io } from "../io/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { withConnection } from "./connected.ts";
import { renderSession } from "./render.ts";

/** The exit code of `steer --wait` for work that someone cancelled, as a shell reports an interrupted command. */
const CANCELLED = 130;

const list: Command = {
  name: "sessions list",
  usage: "<home>",
  summary: "List the sessions of the agent running at the home: the thread and channel each is behind, and whether it is working.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [home] = expectArguments(positionals, ["<home>"]);
    return withConnection(home, async (connection) => {
      const sessions = await connection.sessions();
      if (sessions.length === 0) io.out("The agent has no sessions yet.");
      for (const session of sessions) {
        io.out(`${session.threadId} ${session.channelId} ${session.working ? "working" : "idle"}`);
      }
      return 0;
    });
  },
};

const read: Command = {
  name: "sessions read",
  usage: "<home> <thread> [--json]",
  summary: "Show the session behind a thread: what was said, what the tools did, and what it is doing now.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [home, thread] = expectArguments(positionals, ["<home>", "<thread>"]);
    return withSession(home, thread, (session) => {
      io.out(values.json === true ? JSON.stringify(session.view) : renderSession(session.view));
      return Promise.resolve(0);
    });
  },
};

const steer: Command = {
  name: "sessions steer",
  usage: "<home> <thread> <text> [--request-id <id>] [--wait]",
  summary: "Give the session behind a thread input; it joins work already running.",
  details:
    "Direct input is a control, like stopping, and not a message: the thread does not see it. If it joins a " +
    "turn that is answering a message, that answer covers it; otherwise the answer stays in the session. " +
    "To talk to an agent, post to its thread. " +
    "With --wait, print the answer and exit 0 when the input was answered, 1 when it failed or ended " +
    "without an answer, and 130 when it was cancelled. A retry with the same --request-id is the same input.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: { "request-id": { type: "string" }, wait: { type: "boolean" } },
        allowPositionals: true,
      }),
    );
    const [home, thread, text] = expectArguments(positionals, ["<home>", "<thread>", "<text>"]);
    if (text.trim() === "") throw new UsageError("The text is empty.");
    return withSession(home, thread, async (session) => {
      const { submission } = await session.steer(text, values["request-id"]);
      if (values.wait !== true) {
        io.out(`Accepted as submission ${submission}.`);
        return 0;
      }
      return report(await session.wait(submission), io);
    });
  },
};

/** Say how the input ended: the answer on standard output, anything else on standard error. */
function report(settlement: Settlement, io: Io): number {
  switch (settlement.status) {
    case "answered":
      if (settlement.text !== "") io.out(settlement.text);
      return 0;
    case "cancelled":
      io.err("The input was cancelled before it was answered.");
      return CANCELLED;
    case "unanswered": {
      const why =
        settlement.detail === null ? settlement.reason : `${settlement.reason}: ${settlement.detail}`;
      io.err(`The input ended without an answer (${why}).`);
      return 1;
    }
  }
}

const stop: Command = {
  name: "sessions stop",
  usage: "<home> <thread>",
  summary: "Stop the work in the session behind a thread, and withdraw the input it has not picked up.",
  details:
    "Messages still waiting stay in the thread, marked as skipped, and the agent reads them with the next one. " +
    "The agent keeps running. To stop the agent itself, send its process SIGTERM or press Ctrl+C.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [home, thread] = expectArguments(positionals, ["<home>", "<thread>"]);
    return withSession(home, thread, async (session) => {
      await session.stop();
      io.out(`Stopped the work in the session for thread ${thread}.`);
      return 0;
    });
  },
};

/** Attach to the session behind `thread` at the agent at `home` for the length of `use`. */
function withSession<T>(home: string, thread: string, use: (session: SessionHandle) => Promise<T>): Promise<T> {
  return withConnection(home, async (connection) => use(await connection.attach(thread)));
}

export const sessionsCommands: Command[] = [list, read, steer, stop];
