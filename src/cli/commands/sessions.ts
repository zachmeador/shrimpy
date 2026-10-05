import { parseArgs } from "node:util";
import type { SessionHandle, Settlement } from "../../contracts/agent/index.ts";
import type { Io } from "../io/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { withConnection } from "./connected.ts";
import { renderSession } from "./render.ts";

/** The exit code of `steer --wait` for work that someone cancelled, as a shell reports an interrupted command. */
const CANCELLED = 130;

/** What a session is called, which every command that takes one says. */
const ADDRESS =
  "A session is named by its thread's ID, or, for the session of its own that a trigger with no thread has, " +
  "by trigger: and the trigger's name. sessions list shows them.";

const list: Command = {
  name: "sessions list",
  usage: "<agent>",
  summary:
    "List the sessions of a running agent: each one's name (a thread's ID, or trigger: and a trigger's name), the channel it is behind, if any, and whether it is working.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [agent] = expectArguments(positionals, ["<agent>"]);
    return withConnection(agent, async (connection) => {
      const sessions = await connection.sessions();
      if (sessions.length === 0) io.out("The agent has no sessions yet.");
      for (const session of sessions) {
        io.out(`${session.id} ${session.channelId ?? "-"} ${session.working ? "working" : "idle"}`);
      }
      return 0;
    });
  },
};

const read: Command = {
  name: "sessions read",
  usage: "<agent> <session> [--json]",
  summary: "Show a session: what was said, what the tools did, and what it is doing now.",
  details: ADDRESS,
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [agent, session] = expectArguments(positionals, ["<agent>", "<session>"]);
    return withSession(agent, session, (attached) => {
      io.out(values.json === true ? JSON.stringify(attached.view) : renderSession(attached.view));
      return Promise.resolve(0);
    });
  },
};

const steer: Command = {
  name: "sessions steer",
  usage: "<agent> <session> <text> [--request-id <id>] [--wait]",
  summary: "Give a session input; it joins work already running.",
  details:
    `${ADDRESS} ` +
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
    const [agent, session, text] = expectArguments(positionals, ["<agent>", "<session>", "<text>"]);
    if (text.trim() === "") throw new UsageError("The text is empty.");
    return withSession(agent, session, async (attached) => {
      const { submission } = await attached.steer(text, values["request-id"]);
      if (values.wait !== true) {
        io.out(`Accepted as submission ${submission}.`);
        return 0;
      }
      return report(await attached.wait(submission), io);
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
  usage: "<agent> <session>",
  summary: "Stop the work in a session, and withdraw the input it has not picked up.",
  details:
    `${ADDRESS} ` +
    "Messages still waiting stay in the thread, marked skipped, and the agent reads them with the next one. " +
    "The agent keeps running. To stop the agent itself, send its process SIGTERM or press Ctrl+C.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [agent, session] = expectArguments(positionals, ["<agent>", "<session>"]);
    return withSession(agent, session, async (attached) => {
      await attached.stop();
      io.out(`Stopped the work in the session ${session}.`);
      return 0;
    });
  },
};

/** Attach to `session` at the agent `agent` names, a name or the path of its home, for the length of `use`. */
function withSession<T>(agent: string, session: string, use: (attached: SessionHandle) => Promise<T>): Promise<T> {
  return withConnection(agent, async (connection) => use(await connection.attach(session)));
}

export const sessionsCommands: Command[] = [list, read, steer, stop];
