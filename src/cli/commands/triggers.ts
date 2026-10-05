import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  describeSchedule,
  draftTrigger,
  NoTriggerError,
  placeOfThread,
  readHomeTriggers,
  removeTrigger,
  saveTrigger,
  switchTrigger,
  TriggerFileError,
} from "../../agent/index.ts";
import { AGENT_HOME_VARIABLE, type AgentConnection, type TriggerSchedule } from "../../contracts/agent/index.ts";
import type { Io } from "../io/index.ts";
import { type Reached, reachChat } from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { connectIfRunning, noAgentRunning } from "./connected.ts";
import { leftOutLines, whatItReads } from "./reloaded.ts";
import { renderTrigger, renderTriggerFile, renderTriggerFiles, renderTriggers, when } from "./render-triggers.ts";
import { ABOUT_ANOTHER_AGENT, AGENT_OPTION, agentToActOn, command, mayActOn, type Target } from "./which-agent.ts";

/** What takes an admin, when a command run in the shell of another agent changes this agent's trigger files. */
const CHANGE = "Changing another agent's triggers";

/** How to make a trigger, for an error that has to say what to do next. */
const MAKE_ONE = 'triggers add <name> --every 1h "<what to do>"';

/** The sentence for a trigger that is not there: which triggers there are, or how to make the first. */
function noTrigger(target: Target, name: string, known: readonly string[]): string {
  const instead =
    known.length === 0
      ? `It has no triggers yet. Make one with: ${command(target, MAKE_ONE)}`
      : `Its triggers are: ${known.join(", ")}.`;
  return `There is no trigger called ${name}. ${instead}`;
}

/** What a command says when a trigger has to be asked of an agent that is not running, which only the files of its home can stand in for. */
function saysFilesOnly(io: Io, target: Target): void {
  io.err(
    `No agent is running at ${target.home}, so this shows only what its trigger files say, and nothing about ` +
      `when a trigger runs next or how its last occurrence ended. Start one with: shrimpy agent serve ${target.given}`,
  );
}

/** Run `use` with the connection to the agent, if one is running, and let the connection go. */
async function whileRunning<T>(target: Target, use: (connection: AgentConnection | undefined) => Promise<T>): Promise<T> {
  const connection = await connectIfRunning(target.home);
  try {
    return await use(connection);
  } finally {
    await connection?.close().catch(() => undefined);
  }
}

/** The names of the triggers a running agent has. */
async function triggersOf(connection: AgentConnection): Promise<string[]> {
  return (await connection.triggers()).map((trigger) => trigger.name);
}

/**
 * After a change to the files of triggers: tell a running agent to read its
 * files again, and say what it answered, then do what `then` adds; or, with no
 * agent running, say the change waits for the start, followed by `afterStart`,
 * which finishes the clause.
 */
async function followed(
  io: Io,
  target: Target,
  then?: (connection: AgentConnection) => Promise<void>,
  afterStart = "",
): Promise<void> {
  await whileRunning(target, async (connection) => {
    if (connection === undefined) {
      io.out(
        `No agent is running at ${target.home}, so the change takes effect when the agent starts${afterStart}. ` +
          `Start one with: shrimpy agent serve ${target.given}`,
      );
      return;
    }
    const reloaded = await connection.reload();
    io.out(`Told the agent to read its files again. It now reads ${whatItReads(reloaded)}.`);
    if (reloaded.leftOut.length > 0) io.out(`Left out:\n${leftOutLines(reloaded.leftOut).join("\n")}`);
    await then?.(connection);
  });
}

/**
 * Check, before a trigger is written, that the agent can use the thread it
 * names, the way the agent does when an occurrence needs it: ask chat which of
 * the channels it is in has the thread. Chat can only be asked as the agent in
 * the agent's own shell, so anywhere else, or with chat out of reach, this says
 * that the thread was not checked and carries on, since an occurrence that
 * cannot reach its thread fails and says so. A thread that chat answers for
 * with no channel of the agent's is refused.
 */
async function checkThread(io: Io, target: Target, thread: string): Promise<void> {
  const shell = process.env[AGENT_HOME_VARIABLE];
  if (shell === undefined || shell === "" || resolve(shell) !== target.home) {
    io.out(
      `Thread ${thread} was not checked, because only the agent itself can say whether it is in the thread's ` +
        "channel, and this command is not run by it. If it is not, each occurrence fails and says so.",
    );
    return;
  }
  let reached: Reached;
  try {
    reached = await reachChat(io);
  } catch (error) {
    io.out(
      `Thread ${thread} was not checked, because chat could not be reached: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  try {
    const place = await placeOfThread(reached.connection.chat, thread);
    if (place.kind === "missing") {
      throw new UsageError(
        `Nothing was written: you are in no channel that has the thread ${thread}. There is no such thread, or you ` +
          "are not in its channel. Give --thread one of yours: shrimpy threads <name> lists your threads with a member, " +
          'and shrimpy threads "#room" those of a room.',
      );
    }
    if (place.kind === "unreachable") {
      io.out(`Thread ${thread} was not checked, because chat dropped the connection. If the agent is not in its channel, each occurrence fails and says so.`);
    }
  } finally {
    await reached.close();
  }
}

/** Make a change to a trigger's file, and turn what can go wrong with it into what to say. */
async function changing<T>(target: Target, name: string, change: () => Promise<T>): Promise<T> {
  try {
    return await change();
  } catch (error) {
    if (error instanceof NoTriggerError) throw new Error(noTrigger(target, name, error.known), { cause: error });
    if (error instanceof TriggerFileError) {
      throw new Error(
        `triggers/${name}.md was not changed: ${error.message}. Fix the file, or write it again with: ` +
          command(target, MAKE_ONE.replace("<name>", () => name)),
        { cause: error },
      );
    }
    throw error;
  }
}

const list: Command = {
  name: "triggers",
  usage: "[--agent <agent>]",
  summary:
    "List the triggers of an agent: each one's schedule, whether it is on, when it runs next and how its last occurrence ended.",
  details: [
    "A trigger gives an agent a prompt on a schedule, again and again, such as every hour or at 3 every morning. " +
      "Use one for work that repeats. To be woken once, later, an agent uses its check_back tool instead.",
    "",
    "To make one:",
    '  shrimpy triggers add nightly --cron "0 3 * * *" "Look over today\'s notes and tidy what needs it."',
    '  shrimpy triggers add heartbeat --every 1h "Check the build, and use send_message to tell @maya if it broke."',
    "To be woken only when something has changed, give the trigger a check, a command that runs first:",
    '  shrimpy triggers add inbox --every 10m --check "ls inbox | wc -l" "Tell @maya what is new in the inbox."',
    "The other commands take a trigger's name: show, run, on, off and remove, as in: shrimpy triggers show nightly. " +
      "Each has its own --help.",
    "",
    "With no --agent these commands act on the agent whose shell they run in, and in your own terminal on the only " +
      "agent your Shrimpy folder has. --agent <agent>, a name or a path, acts on another, and is needed when the " +
      "folder has more than one agent. With no agent running, this shows only what the trigger files say, and exits 1.",
    "",
    ABOUT_ANOTHER_AGENT,
  ].join("\n"),
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    const [extra] = positionals;
    if (extra !== undefined) {
      throw new UsageError(
        `Unexpected argument: ${extra}. This lists the triggers. To do something with one, put the verb first: ` +
          `add, show, run, on, off or remove, as in: shrimpy triggers show ${extra}`,
      );
    }
    const target = agentToActOn(values.agent);
    const none = `No triggers yet. Make one with: ${command(target, MAKE_ONE)}`;

    return whileRunning(target, async (connection) => {
      if (connection !== undefined) {
        const triggers = await connection.triggers();
        for (const line of triggers.length === 0 ? [none] : renderTriggers(triggers)) io.out(line);
        return 0;
      }
      saysFilesOnly(io, target);
      const { triggers, problems } = await readHomeTriggers(target.home);
      for (const line of triggers.length === 0 ? [none] : renderTriggerFiles(triggers)) io.out(line);
      if (problems.length > 0) io.out(`Left out:\n${leftOutLines(problems).join("\n")}`);
      return 1;
    });
  },
};

const add: Command = {
  name: "triggers add",
  usage:
    '<name> (--every <delay> | --cron "<fields>" [--timezone <zone>]) [--thread <id>] [--overlap allow] ' +
    '[--check "<command>" [--when changed|output|always] [--then wake] [--timeout <delay>]] "<prompt>" [--agent <agent>]',
  summary: "Make a trigger, or replace the one of that name: a prompt the agent is given on a schedule.",
  details: [
    "Give --every, how often, or --cron, when, and not both. --every is a whole number and a unit, m, h or d, " +
      "at least 1m, such as 15m, 1h or 1d: the first occurrence comes one interval after the agent first sees the " +
      "trigger, and each after that counts from the last. --cron is five fields, minute hour day-of-month month " +
      'day-of-week, such as "0 3 * * *" for 3 every morning, in the time zone --timezone names, an IANA name such ' +
      "as Europe/Berlin, or this machine's when it is left out.",
    "",
    "The prompt is what the agent is told at each occurrence. Without --thread, each occurrence goes to a session " +
      "of the trigger's own, called trigger:<name>, which keeps its history from one occurrence to the next. What " +
      "the agent writes last there is posted nowhere: to tell someone something it uses send_message with to. " +
      "With --thread <id>, each goes to the session behind that thread, which the first one makes if the agent " +
      "has none, and what the agent writes last is posted in the thread. Run in the agent's own shell, this checks " +
      "before it writes that the agent is in the thread's channel. An occurrence that is due while the last is " +
      "still going is skipped, unless --overlap allow lets it wait behind.",
    "",
    "Without --check, every occurrence wakes the agent. --check is a command line that runs at each occurrence, " +
      "before anything else, from the agent's home with the shrimpy command on its path, and the agent is woken only " +
      "when it finds news. --when says what that is: changed, the default, is output that differs from the last " +
      "occurrence's, which a trigger's first always does; output is any output at all; always is every time. The " +
      "output is what the command prints on standard output, trimmed and cut at 2,000 characters. A command that " +
      "exits with anything but 0, runs longer than --timeout, 1m unless given and at most 10m, or can't be started " +
      "has failed, and the failure is news in its own right, once, until it fails differently. --then wake, the " +
      "only thing news does so far, gives the agent the prompt and, apart from it, the output, which it reads as " +
      "data and not as instructions. With no news, no turn is made and no model is called.",
    "",
    "What is given is checked before anything is written, and the error says what to give instead. It is written " +
      "as triggers/<name>.md in the agent's home, in place of any trigger of that name, and the new trigger is on. " +
      "A running agent is then told to read its files again, and this says when the trigger runs first. An agent " +
      "that is not running reads the file when it starts, and a new trigger counts from then.",
  ].join("\n"),
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({
        args,
        options: {
          ...AGENT_OPTION,
          every: { type: "string" },
          cron: { type: "string" },
          timezone: { type: "string" },
          thread: { type: "string" },
          overlap: { type: "string" },
          check: { type: "string" },
          when: { type: "string" },
          then: { type: "string" },
          timeout: { type: "string" },
        },
        allowPositionals: true,
      }),
    );
    const [name, prompt] = expectArguments(positionals, ["<name>", "<prompt>"]);
    if (values.every === undefined && values.cron === undefined) {
      throw new UsageError('Say when it runs: give --every, how often, such as --every 1h, or --cron, when, such as --cron "0 3 * * *".');
    }
    if (values.every !== undefined && values.cron !== undefined) throw new UsageError("Give --every or --cron, not both.");
    if (prompt.trim() === "") throw new UsageError("The prompt is empty. Say what the trigger is to do.");
    const target = agentToActOn(values.agent);
    await mayActOn(target, CHANGE);

    let draft: ReturnType<typeof draftTrigger>;
    try {
      draft = draftTrigger(name, {
        every: values.every,
        cron: values.cron,
        timezone: values.timezone,
        thread: values.thread,
        overlap: values.overlap,
        check: values.check,
        when: values.when,
        then: values.then,
        timeout: values.timeout,
        prompt,
      });
    } catch (error) {
      if (error instanceof TriggerFileError) throw new UsageError(`Nothing was written: ${error.message}.`);
      throw error;
    }

    if (draft.definition.thread !== null) await checkThread(io, target, draft.definition.thread);
    const { file, replaced } = await saveTrigger(target.home, draft);
    io.out(`${replaced ? "Replaced" : "Made"} the trigger ${name}, written to ${file}.`);
    await followed(
      io,
      target,
      async (connection) => {
        const { next } = await connection.trigger(name);
        if (next !== null) io.out(`It ${replaced ? "next" : "first"} runs at ${when(next, Date.now())}.`);
      },
      // A trigger that is new counts from the start. One that replaces another may keep the clock of the one before.
      replaced ? "" : firstRunAfterStart(draft.definition.schedule),
    );
    return 0;
  },
};

/** What finishes the note that a trigger just made waits for the agent to start: when it first runs, counting from the start. */
function firstRunAfterStart(schedule: TriggerSchedule): string {
  return "every" in schedule
    ? `, and the trigger first runs ${schedule.every} after that`
    : `, and the trigger first runs at the first time after that which matches ${describeSchedule(schedule)}`;
}

const show: Command = {
  name: "triggers show",
  usage: "<name> [--agent <agent>]",
  summary: "Show a trigger: what it says, when it runs next and its latest occurrences.",
  details:
    "Its schedule, where it goes, what it does when an occurrence is due while the last is still going, its " +
    "check if it has one, its prompt, when it runs next and how its latest occurrences ended, newest first: an " +
    "occurrence of a trigger with a check can also end quiet, when the check found no news, or interrupted, when the " +
    "agent stopped while the check ran. With no agent running, it shows only what the trigger's file says, and exits 1.",
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    const [name] = expectArguments(positionals, ["<name>"]);
    const target = agentToActOn(values.agent);

    return whileRunning(target, async (connection) => {
      if (connection !== undefined) {
        const known = await triggersOf(connection);
        if (!known.includes(name)) throw new Error(noTrigger(target, name, known));
        for (const line of renderTrigger(await connection.trigger(name), Date.now())) io.out(line);
        return 0;
      }
      saysFilesOnly(io, target);
      const { triggers, problems } = await readHomeTriggers(target.home);
      const found = triggers.find((trigger) => trigger.name === name);
      if (found !== undefined) {
        for (const line of renderTriggerFile(found)) io.out(line);
        return 1;
      }
      const left = problems.filter((problem) => problem.name === name);
      if (left.length === 0) throw new Error(noTrigger(target, name, triggers.map((trigger) => trigger.name)));
      io.out(`Left out:\n${leftOutLines(left).join("\n")}`);
      return 1;
    });
  },
};

const run: Command = {
  name: "triggers run",
  usage: "<name> [--agent <agent>]",
  summary: "Fire a trigger now, apart from its schedule, which it keeps.",
  details:
    "Needs a running agent. The occurrence runs in the background: follow it with shrimpy triggers show. A trigger " +
    "that is off can be fired too. A trigger with a check is fired without running it: the agent is woken with the " +
    "prompt alone. If the trigger does not allow overlap and its last occurrence is still going, this one is " +
    "skipped, and the command exits 1.",
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    const [name] = expectArguments(positionals, ["<name>"]);
    const target = agentToActOn(values.agent);

    return whileRunning(target, async (connection) => {
      if (connection === undefined) throw new Error(noAgentRunning(target.home, target.given));
      const known = await triggersOf(connection);
      if (!known.includes(name)) throw new Error(noTrigger(target, name, known));
      const occurrence = await connection.fire(name);
      if (occurrence.ended !== null) {
        io.err(`The trigger ${name} did not run. ${occurrence.reason ?? `It ended as ${occurrence.ended}.`}`);
        return 1;
      }
      io.out(`Fired the trigger ${name}. It runs in the background; follow it with: ${command(target, `triggers show ${name}`)}`);
      return 0;
    });
  },
};

/** `on` and `off`: the same command, turning a trigger one way or the other. */
function switching(enabled: boolean): Command {
  const word = enabled ? "on" : "off";
  return {
    name: `triggers ${word}`,
    usage: "<name> [--agent <agent>]",
    summary: enabled ? "Turn a trigger on." : "Turn a trigger off, and keep it.",
    details: enabled
      ? "Takes enabled: false out of the trigger's file, then tells a running agent to read its files again. " +
        "Its schedule counts from then. An agent that is not running reads the file when it starts."
      : "Puts enabled: false in the trigger's file, then tells a running agent to read its files again. A trigger " +
        "that is off never runs on its schedule, but shrimpy triggers run still runs it. An occurrence that is " +
        "running is not stopped: shrimpy sessions stop does that.",
    async run(args, io) {
      const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
      const [name] = expectArguments(positionals, ["<name>"]);
      const target = agentToActOn(values.agent);
      await mayActOn(target, CHANGE);

      const { changed } = await changing(target, name, () => switchTrigger(target.home, name, enabled));
      io.out(changed ? `Turned ${word} the trigger ${name}.` : `The trigger ${name} is ${word} already.`);
      await followed(io, target);
      return 0;
    },
  };
}

const remove: Command = {
  name: "triggers remove",
  usage: "<name> [--agent <agent>]",
  summary: "Delete a trigger.",
  details:
    "Deletes the trigger's file, then tells a running agent to read its files again, which ends the trigger. An " +
    "occurrence that is running is not stopped: shrimpy sessions stop does that. The trigger's session, " +
    "trigger:<name>, stays, so that what it did can still be read.",
  async run(args, io) {
    const { values, positionals } = parsing(() => parseArgs({ args, options: AGENT_OPTION, allowPositionals: true }));
    const [name] = expectArguments(positionals, ["<name>"]);
    const target = agentToActOn(values.agent);
    await mayActOn(target, CHANGE);

    const { file } = await changing(target, name, () => removeTrigger(target.home, name));
    io.out(`Removed the trigger ${name}: ${file} is deleted.`);
    await followed(io, target);
    return 0;
  },
};

export const triggersCommands: Command[] = [list, add, show, run, switching(true), switching(false), remove];
