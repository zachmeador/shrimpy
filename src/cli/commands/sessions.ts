import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { failureWords, MAX_READ, type Settlement } from "../../contracts/agent/index.ts";
import { contextOf, valueOf } from "../../contracts/gateway/index.ts";
import { shellWord } from "../../lib/text/index.ts";
import type { Io } from "../io/index.ts";
import { type HeldSession, onAgent, onSession } from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { withConnection } from "./connected.ts";
import { renderSession, type WholeSession } from "./render.ts";
import { renderSessions } from "./render-sessions.ts";
import { ABOUT_ANOTHER_AGENT, AGENT_OPTION, agentToActOn, command, type Target, WHICH_AGENT } from "./which-agent.ts";

/** The exit code of `steer --wait` for work that someone cancelled, as a shell reports an interrupted command. */
const CANCELLED = 130;

/** What a session is called, which every command that takes one says. */
const ADDRESS =
  "A session is named by its thread's ID, or, for the session of its own that a trigger with no thread has, " +
  "by trigger: and the trigger's name. sessions list shows them.";

const list: Command = {
  name: "sessions list",
  usage: "[--agent <agent>]",
  summary:
    "List the sessions of a running agent: each one's name (a thread's ID, or trigger: and a trigger's name), where it is (a DM with someone, a room, or a trigger's own), and whether it is working.",
  details: `${WHICH_AGENT} ${ABOUT_ANOTHER_AGENT}`,
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    expectArguments(positionals, []);
    return withConnection(agentToActOn(values.agent), (reached) =>
      onAgent(reached, async (agent) => {
        const sessions = agent.sessions.value;
        if (sessions.length === 0) io.out("The agent has no sessions yet.");
        else for (const line of renderSessions(sessions)) io.out(line);
        return 0;
      }),
    );
  },
};

const read: Command = {
  name: "sessions read",
  usage: "<session> [--json] [--agent <agent>]",
  summary: "Show a session: what was said, what the tools did, and what it is doing now.",
  details: `${ADDRESS} ${WHICH_AGENT} ${ABOUT_ANOTHER_AGENT}`,
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { ...AGENT_OPTION, json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [session] = expectArguments(positionals, ["<session>"]);
    const target = agentToActOn(values.agent);
    return withSession(target, session, async (held) => {
      const whole = await wholeSession(held);
      if (values.json === true) io.json(whole);
      else io.out(renderSession(whole, command(target, `sessions stop ${shellWord(session)}`)));
      return 0;
    });
  },
};

const steer: Command = {
  name: "sessions steer",
  usage: "<session> <text> [--request-id <id>] [--wait] [--agent <agent>]",
  summary: "Give a session input; it joins work already running.",
  details:
    `${ADDRESS} ` +
    "Direct input is a control, like stopping, and not a message: the thread does not see it. If it joins a " +
    "turn that is answering a message, that answer covers it; otherwise the answer stays in the session. " +
    "To talk to an agent, post to its thread. " +
    "With --wait, print the answer and exit 0 when the input was answered, 1 when it failed or ended " +
    "without an answer, and 130 when it was cancelled. A retry with the same --request-id is the same input. " +
    `${WHICH_AGENT} ${ABOUT_ANOTHER_AGENT}`,
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: { ...AGENT_OPTION, "request-id": { type: "string" }, wait: { type: "boolean" } },
        allowPositionals: true,
      }),
    );
    const [session, text] = expectArguments(positionals, ["<session>", "<text>"]);
    if (text.trim() === "") throw new UsageError("The text is empty.");
    return withSession(agentToActOn(values.agent), session, async (held) => {
      const { submission } = valueOf(await held.steer({ text, request: values["request-id"] ?? randomUUID() }, contextOf()));
      if (values.wait !== true) {
        io.out(`Accepted as submission ${submission}.`);
        return 0;
      }
      return report(valueOf(await held.wait({ submission }, contextOf())), io);
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
    case "unanswered":
      io.err(failureWords(settlement.reason, settlement.detail));
      return 1;
  }
}

const stop: Command = {
  name: "sessions stop",
  usage: "<session> [--agent <agent>]",
  summary: "Stop the work in a session, and withdraw the input it has not picked up.",
  details:
    `${ADDRESS} ` +
    "Messages still waiting stay in the thread, marked skipped, and the agent reads them with the next one. " +
    "The agent keeps running. To stop the agent itself, send its process SIGTERM or press Ctrl+C. " +
    `${WHICH_AGENT} ${ABOUT_ANOTHER_AGENT}`,
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    const [session] = expectArguments(positionals, ["<session>"]);
    return withSession(agentToActOn(values.agent), session, async (held) => {
      valueOf(await held.stop(contextOf()));
      io.out(`Stopped the work in the session ${session}.`);
      return 0;
    });
  },
};

/** Hold `session` at the agent `target` is, for the length of `use`. */
function withSession<T>(target: Target, session: string, use: (held: HeldSession) => Promise<T>): Promise<T> {
  return withConnection(target, (reached) => onSession(reached, session, use));
}

/** The whole of a session, oldest first: its window's items, and every page before them, read back from where the window starts. */
async function wholeSession(held: HeldSession): Promise<WholeSession> {
  const status = held.status.value;
  if (status === null) throw new Error("The agent did not say what the session is doing.");
  let { items, before } = held.window.value;
  while (before !== null) {
    const page = valueOf(await held.read({ before, limit: MAX_READ }, contextOf()));
    items = [...page.items, ...items];
    before = page.before;
  }
  return { items, status };
}

export const sessionsCommands: Command[] = [list, read, steer, stop];
