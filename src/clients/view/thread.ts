import { activityWords, describeSchedule, modelWords, onceTriggerPrompt, YOUR_DM } from "../../contracts/agent/index.ts";
import {
  agentCommandIn,
  answerWakeWords,
  ARCHIVED,
  type Attachment,
  isPicture,
  type Member,
  type Message,
  mentionsOf,
  namer,
  processWakeWords,
  receiptWords,
  titleOf,
  triggerLabel,
  type WakeLine,
} from "../../contracts/chat/index.ts";
import { oneLine, plain } from "../../lib/plain/index.ts";
import { sizeWords } from "../../lib/text/index.ts";
import {
  agentNameOf,
  agentOfList,
  agentRuns,
  type Model,
  onceTriggersIn,
  openThreadOf,
  processesIn,
  processOutputKey,
  sidesOf,
  standingOf,
  standingTriggersIn,
  type Status,
  stillFlagsIn,
  threadReferenceLabel,
  waitsOnThread,
  watchesIn,
} from "../state/index.ts";
import { type CommandLine, commandLines } from "./commands.ts";
import { BRIEF, type LevelOptions, lookingAt, OUTPUT_LINES } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { elapsedOf, whenOf } from "./time.ts";
import { type OutputShown, outputShown, type Shown, type Work, workOf } from "./work.ts";
import {
  agentStatusRows,
  DELETED,
  devicesRows,
  earlierMessages,
  editedAt,
  type InFull,
  membersLine,
  newRoomThreadHint,
  newThreadHint,
  queuedLine,
  reactedBy,
  READ_ONLY_TAG,
  readOnlyLine,
  roomStatusRows,
  statusHeader,
  stopReadOnlyCommand,
  THREAD_EMPTY,
  threadCalled,
  threadTitle,
  workingLine,
} from "./words.ts";

/** Structured details of a wake line left in a thread. */
export type WakeRow =
  | { kind: "trigger"; name: string | null; label: string; brought: string }
  | { kind: "process"; command: string; how: string; failed: boolean; brought: string }
  | {
      kind: "answer";
      /** Member ID of the agent that waited (whose list opens the watched DM thread). */
      agent: string;
      fromId: string;
      fromName: string;
      fromLook: Look;
      how: string;
      stopped: boolean;
      threadId: string;
      title: string;
    };

/** One message of a thread, as it now stands, or a wake line. */
export interface MessageRow {
  id: string;
  kind: "message" | "wake";
  /** Present when `kind === "wake"`. */
  wake: WakeRow | undefined;
  who: string;
  agent: boolean;
  look: Look | undefined;
  when: string;
  edited: string | undefined;
  deleted: boolean;
  text: string;
  command: boolean;
  mentions: Mention[];
  reactions: { emoji: string; by: string }[];
  receipts: { words: string; failed: boolean }[];
  firstNew: boolean;
  /** The pictures that came with it, which a client shows, in the order they were sent. */
  pictures: FileRow[];
  /** The other files that came with it, each its name and size. */
  files: FileRow[];
}

/** A file that came with a message: what chat has of it, to fetch it by, and its name and size as a person reads them. */
export interface FileRow {
  attachment: Attachment;
  name: string;
  size: string;
}

const fileRow = (attachment: Attachment): FileRow => ({ attachment, name: oneLine(attachment.name), size: sizeWords(attachment.size) });

export interface Mention {
  name: string;
  look: Look;
}

export type TextPart = string | { mention: string; look: Look };

export function withMentions(text: string, mentions: readonly Mention[]): TextPart[] {
  const found = mentions
    .flatMap(({ name, look }) => mentionsOf(text, name).map((span) => ({ ...span, look })))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const parts: TextPart[] = [];
  let at = 0;
  for (const { start, end, look } of found) {
    if (start < at) continue;
    if (start > at) parts.push(text.slice(at, start));
    parts.push({ mention: text.slice(start, end), look });
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

export interface StatusBlock {
  header: string;
  rows: string[];
}

export interface AgentWork {
  agent: string;
  name: string;
  look: Look;
  work: Work;
  doing: string;
  stale: boolean;
}

/** A background `bash` command running in the open thread. */
export interface StillProcess {
  id: string;
  agent: string;
  agentName: string;
  command: string;
  since: string;
  started: string;
  output: OutputShown | undefined;
}

/** An open watch started from the open thread. */
export interface StillWatch {
  id: string;
  byAgent: string;
  byName: string;
  onAgent: string;
  onName: string;
  onLook: Look;
  onRunning: boolean;
  toThread: string;
  since: string;
}

/** A trigger targeting the open thread: one-shot (`once`) or standing (`standing`). */
export interface StillTrigger {
  kind: "once" | "standing";
  /** One-shot ID (`once_...`) or standing trigger name. */
  id: string;
  agent: string;
  agentName: string;
  agentLook: Look;
  when: string;
  say: string;
  on: boolean;
}

/** An agent waiting on THIS thread from another thread. */
export interface ReverseWatch {
  byAgent: string;
  byName: string;
  byLook: Look;
  fromThread: string;
  fromLabel: string;
}

/** Everything still going in a thread between turns. */
export interface ThreadStill {
  manyAgents: boolean;
  processes: StillProcess[];
  watches: StillWatch[];
  triggers: StillTrigger[];
  waitedBy: ReverseWatch[];
}

/** The third level: the open thread. */
export interface ThreadLevel {
  title: string;
  who: string;
  called: string;
  name: string;
  archived: boolean;
  tag: string | undefined;
  nameable: boolean;
  look: Look | undefined;
  sub: string[];
  lead: string | undefined;
  messages: MessageRow[];
  working: string | undefined;
  workingCounted: string | undefined;
  /** Agents currently running a turn in this thread. */
  workingAgents: { id: string; name: string }[];
  /** Shell command to stop a turn on a read-only thread (for the terminal). */
  stopCommand: string | undefined;
  from: string | undefined;
  works: AgentWork[];
  /** Everything still going in this thread: background commands, open watches, triggers, and reverse watches. */
  still: ThreadStill;
  queued: string[];
  commands: CommandLine[];
  readOnly: string | undefined;
  joinable: boolean;
  status: StatusBlock | undefined;
  writable: boolean;
  turnable: boolean;
  notes: string[];
}

export interface ThreadOptions extends LevelOptions {
  inFull?: InFull;
  outputLines?: number;
}

export function threadLevel(model: Model, options: ThreadOptions): ThreadLevel | undefined {
  const { item } = model.open;
  if (item === undefined) return undefined;
  const { now } = options;
  const { place, thread: threadId } = item;
  const here = lookingAt(model, place);
  const live = threadId !== undefined && model.thread?.thread.id === threadId ? model.thread : undefined;
  const thread = openThreadOf(model);
  const known = namer([...(model.thread?.messages ?? []).map((message) => message.author), ...(here.channel?.members ?? [])]);
  const names = (memberId: string): string => oneLine(known(memberId));
  const from = agentOfList(model.open);
  const dm = place.kind === "agent";
  const reading = place.kind === "read-only";
  const who = here.label;

  const members = here.channel?.members ?? [];
  const firstNew = live?.firstNew;
  const messages = (live?.messages ?? []).map((message) => messageRow(message, { model, names, members, firstNew }, now));
  const busy = (agent: string): boolean => model.behind[agent]?.status.busy === true && model.behind[agent].reached;
  const nameOf = (agent: string): string => (known(agent) === agent ? oneLine(agentNameOf(model, agent)) : names(agent));
  const workers = [...new Set([...(thread?.working.map((mark) => mark.memberId) ?? []), ...Object.keys(model.behind).filter(busy)])]
    .map((agent) => ({ id: agent, name: nameOf(agent) }))
    .sort((a, b) => Number(b.id === from) - Number(a.id === from) || a.name.localeCompare(b.name));
  const [only] = workers;
  const activity = only !== undefined && workers.length === 1 && busy(only.id) ? model.behind[only.id]?.status.activity : undefined;
  const workerNames = workers.map((each) => each.name);
  const working = workers.length === 0 ? undefined : workingLine(workerNames, activity, !reading);
  const workingCounted = workers.length < 2 ? undefined : workingLine(workerNames, activity, !reading, true);
  const dmSession = dm ? model.behind[place.id]?.status : undefined;

  let lead: string | undefined;
  if (threadId === undefined) lead = reading ? undefined : dm ? newThreadHint(who) : newRoomThreadHint(here.name);
  else if (live !== undefined && live.earlier > 0) lead = earlierMessages(live.earlier, threadId);
  else if (live !== undefined && messages.length === 0) lead = THREAD_EMPTY;

  let sub: string[] = [];
  if (dm) sub = [YOUR_DM, ...(dmSession?.ownModel === true && dmSession.model !== null ? [modelWords(dmSession.model)] : [])];
  else if (here.channel?.kind === "dm") sub = [READ_ONLY_TAG];
  else if (here.channel !== undefined) sub = [membersLine(here.channel.members)];

  const still = stillOf(model, threadId, members, dm, now, options.self);
  const called = threadCalled(thread === undefined ? threadId : titleOf(thread));
  const archived = thread?.archived === true;
  const stopCommand = reading && threadId !== undefined && only !== undefined ? stopReadOnlyCommand(threadId, only.name) : undefined;
  return {
    title: threadTitle(who, called),
    who,
    called,
    name: oneLine(thread?.name ?? ""),
    archived,
    tag: archived ? ARCHIVED : undefined,
    nameable: !reading && thread !== undefined && model.chat.state === "up",
    look: dm ? lookOf(model, place.id) : undefined,
    sub,
    lead,
    messages,
    working,
    workingCounted,
    workingAgents: workers,
    stopCommand,
    from,
    works: worksOf(model, from, { inFull: options.inFull ?? BRIEF, outputLines: options.outputLines ?? OUTPUT_LINES, now: options.now }),
    still,
    queued: queuedOf(model),
    commands: reading ? [] : commandLines(dm ? "dm" : "room", standingOf(model), options.updates, stillFlagsIn(model, threadId)),
    readOnly: reading && here.channel !== undefined ? readOnlyLine(here.channel, model.me?.name) : undefined,
    joinable: reading && here.channel?.kind === "room",
    status: model.status === undefined ? undefined : statusBlock(model.status),
    writable: !reading,
    turnable: sidesOf(model).length > 0,
    notes: notesOf(model, { agent: from, watching: false, looking: "work", refused: undefined, notice: true }, options.self),
  };
}

function stillOf(
  model: Model,
  threadId: string | undefined,
  members: readonly Member[],
  dm: boolean,
  now: number,
  self: string,
): ThreadStill {
  const manyAgents = !dm && members.filter((member) => member.kind === "agent").length > 1;
  if (threadId === undefined || model.chat.state === "down") {
    return { manyAgents, processes: [], watches: [], triggers: [], waitedBy: [] };
  }
  const processes: StillProcess[] = processesIn(model, threadId).map(({ agent, process }) => {
    const agentName = oneLine(agentNameOf(model, agent));
    return {
      id: oneLine(process.id),
      agent,
      agentName,
      command: oneLine(process.command),
      since: elapsedOf(process.startedAt, now),
      started: whenOf(process.startedAt, now),
      output: outputShown(model.processOutputs[processOutputKey(agent, process.id)], agentName, self),
    };
  });
  const watches: StillWatch[] = watchesIn(model, threadId).map(({ agent, watch }) => ({
    id: watch.id,
    byAgent: agent,
    byName: oneLine(agentNameOf(model, agent)),
    onAgent: watch.onAgent,
    onName: oneLine(watch.onAgentName),
    onLook: lookOf(model, watch.onAgent),
    onRunning: agentRuns(model, watch.onAgent),
    toThread: watch.toThread,
    since: elapsedOf(watch.startedAt, now),
  }));
  const onces: StillTrigger[] = onceTriggersIn(model, threadId).map(({ agent, trigger }) => ({
    kind: "once",
    id: trigger.id,
    agent,
    agentName: oneLine(agentNameOf(model, agent)),
    agentLook: lookOf(model, agent),
    when: whenOf(trigger.due, now),
    say: oneLine(onceTriggerPrompt(trigger)),
    on: true,
  }));
  const standing: StillTrigger[] = standingTriggersIn(model, threadId).map(({ agent, trigger }) => ({
    kind: "standing",
    id: trigger.name,
    agent,
    agentName: oneLine(agentNameOf(model, agent)),
    agentLook: lookOf(model, agent),
    when: trigger.next === null ? "paused" : whenOf(trigger.next, now),
    say: describeSchedule(trigger.schedule),
    on: trigger.on,
  }));
  const waitedBy: ReverseWatch[] = waitsOnThread(model, threadId).map(({ agent, watch }) => ({
    byAgent: agent,
    byName: oneLine(agentNameOf(model, agent)),
    byLook: lookOf(model, agent),
    fromThread: watch.fromThread,
    fromLabel: oneLine(threadReferenceLabel(model, agent, watch.fromThread)),
  }));
  return { manyAgents, processes, watches, triggers: [...onces, ...standing], waitedBy };
}

function worksOf(model: Model, from: string | undefined, shown: Shown): AgentWork[] {
  return Object.entries(model.behind)
    .flatMap(([agent, view]) => {
      const work = workOf(view, shown);
      if (work === undefined) return [];
      return [{ agent, name: oneLine(agentNameOf(model, agent)), look: lookOf(model, agent), work, doing: activityWords(view.status.activity), stale: !view.reached }];
    })
    .sort((a, b) => Number(b.agent === from) - Number(a.agent === from) || a.name.localeCompare(b.name));
}

function queuedOf(model: Model): string[] {
  const lines = Object.values(model.behind).flatMap((view) => (view.reached ? view.status.queued.map(queuedLine) : []));
  return [...new Set(lines)];
}

function statusBlock(status: Status): StatusBlock {
  const { about } = status;
  switch (about.kind) {
    case "agent":
      return { header: statusHeader(status.at), rows: agentStatusRows(about, status.at) };
    case "room":
      return { header: statusHeader(status.at), rows: roomStatusRows(about, status.at) };
    case "devices":
      return { header: statusHeader(status.at, "devices"), rows: devicesRows(about) };
  }
}

interface RowContext {
  model: Model;
  names: (memberId: string) => string;
  members: readonly Member[];
  firstNew: string | undefined;
}

function receiptsOf(message: Message, names: (memberId: string) => string): MessageRow["receipts"] {
  return message.receipts.flatMap((receipt) => {
    const words = receiptWords(receipt, names(receipt.memberId));
    return words === undefined ? [] : [{ words, failed: receipt.status === "failed" }];
  });
}

function messageRow(message: Message, context: RowContext, now: number): MessageRow {
  if (message.wake !== null) return wakeRow(message, message.wake, context, now);
  const { model, names, members, firstNew } = context;
  const text = message.deleted ? DELETED : plain(message.text).trimEnd();
  return {
    id: message.id,
    kind: "message",
    wake: undefined,
    who: oneLine(message.author.name),
    agent: message.author.kind === "agent",
    look: message.author.kind === "agent" ? lookOf(model, message.author.id) : undefined,
    when: whenOf(message.sentAt, now),
    edited: message.editedAt === null || message.deleted ? undefined : editedAt(whenOf(message.editedAt, now)),
    deleted: message.deleted,
    text,
    command: !message.deleted && agentCommandIn(text) !== undefined,
    mentions: message.deleted
      ? []
      : members
          .filter((member) => member.kind === "agent" && message.mentions.includes(member.id))
          .map((member) => ({ name: oneLine(member.name), look: lookOf(model, member.id) })),
    reactions: message.reactions.map((reaction) => ({ emoji: oneLine(reaction.emoji), by: reactedBy(reaction.memberIds.map(names)) })),
    receipts: receiptsOf(message, names),
    firstNew: message.id === firstNew,
    pictures: message.attachments.filter(isPicture).map(fileRow),
    files: message.attachments.filter((attachment) => !isPicture(attachment)).map(fileRow),
  };
}

function wakeRow(message: Message, line: WakeLine, { model, names, firstNew }: RowContext, now: number): MessageRow {
  const base = {
    id: message.id,
    kind: "wake" as const,
    agent: false,
    look: undefined,
    edited: undefined,
    deleted: false,
    command: false,
    mentions: [],
    reactions: [],
    receipts: receiptsOf(message, names),
    firstNew: message.id === firstNew,
    pictures: [],
    files: [],
  };
  switch (line.kind) {
    case "trigger": {
      const output = line.output === null ? "" : plain(line.output).trimEnd();
      const brought = output.trim() === "" ? plain(line.prompt).trimEnd() : output;
      const label = triggerLabel(line.name);
      return {
        ...base,
        who: label,
        when: whenOf(line.firedAt, now),
        text: brought,
        wake: { kind: "trigger", name: line.name, label, brought },
      };
    }
    case "process": {
      const command = oneLine(line.command);
      const how = processWakeWords(line);
      const failed = (line.state === "exited" && line.code !== null && line.code !== 0) || line.state === "interrupted";
      const brought = line.output === null ? "" : plain(line.output).trimEnd();
      return {
        ...base,
        who: `$ ${command} ${how}`,
        when: whenOf(line.at, now),
        text: brought,
        wake: { kind: "process", command, how, failed, brought },
      };
    }
    case "answer": {
      const fromName = oneLine(line.from.name);
      const how = answerWakeWords(line.status);
      const title = oneLine(line.title);
      return {
        ...base,
        who: `${fromName} ${how}`,
        when: whenOf(line.at, now),
        text: title,
        wake: {
          kind: "answer",
          agent: message.author.id,
          fromId: line.from.id,
          fromName,
          fromLook: lookOf(model, line.from.id),
          how,
          stopped: line.status === "stopped" || line.status === "failed",
          threadId: line.thread,
          title,
        },
      };
    }
  }
}
