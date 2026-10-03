import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { AgentConnection, SessionHandle, Settlement } from "../../contracts/agent/index.ts";
import { AgentNotRunningError, attachLocal } from "../../contracts/agent/node.ts";
import type { Io } from "../io.ts";
import { expectArguments, parsing, UsageError } from "../usage-error.ts";
import type { Command } from "./command.ts";
import { renderSession } from "./render.ts";

/** The exit code of `steer --wait` for work that someone cancelled, as a shell reports an interrupted command. */
const CANCELLED = 130;

const list: Command = {
  name: "sessions list",
  usage: "<home>",
  summary: "List the sessions of the agent running at the home.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [home] = expectArguments(positionals, ["<home>"]);
    return withConnection(home, async (connection) => {
      for (const session of await connection.sessions()) {
        io.out(session.main ? `${session.id} main` : session.id);
      }
      return 0;
    });
  },
};

const read: Command = {
  name: "sessions read",
  usage: "<home> [--json]",
  summary: "Show the main session: what was said, what the tools did, and what it is doing now.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [home] = expectArguments(positionals, ["<home>"]);
    return withMainSession(home, (session) => {
      io.out(values.json === true ? JSON.stringify(session.view) : renderSession(session.view));
      return Promise.resolve(0);
    });
  },
};

const steer: Command = {
  name: "sessions steer",
  usage: "<home> <text> [--request-id <id>] [--wait]",
  summary: "Give the main session input; it joins work already running.",
  details:
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
    const [home, text] = expectArguments(positionals, ["<home>", "<text>"]);
    if (text.trim() === "") throw new UsageError("The text is empty.");
    return withMainSession(home, async (session) => {
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
  usage: "<home>",
  summary: "Cancel the main session's current work and withdraw input it has not picked up.",
  details: "The agent keeps running. To stop the agent itself, send its process SIGTERM or press Ctrl+C.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [home] = expectArguments(positionals, ["<home>"]);
    return withMainSession(home, async (session) => {
      await session.abort();
      io.out("Cancelled the work in the main session.");
      return 0;
    });
  },
};

/** Connect to the agent at `home` for the length of `use`. */
async function withConnection<T>(home: string, use: (connection: AgentConnection) => Promise<T>): Promise<T> {
  const root = resolve(home);
  let connection: AgentConnection;
  try {
    connection = await attachLocal(root);
  } catch (error) {
    if (error instanceof AgentNotRunningError) {
      throw new Error(`${error.message} Start one with: shrimpy agent serve ${root}`, { cause: error });
    }
    throw error;
  }
  try {
    return await use(connection);
  } finally {
    // The agent may be gone by now, and there is nothing left to release.
    await connection.close().catch(() => undefined);
  }
}

function withMainSession<T>(home: string, use: (session: SessionHandle) => Promise<T>): Promise<T> {
  return withConnection(home, async (connection) => {
    const main = (await connection.sessions()).find((session) => session.main);
    if (main === undefined) throw new Error("The agent has no main session.");
    return use(await connection.attach(main.id));
  });
}

export const sessionsCommands: Command[] = [list, read, steer, stop];
