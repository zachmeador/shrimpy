import { type HomeEntry, modelWords, onceTriggerPrompt, placeLabel, type TriggerSummary, YOUR_DM } from "../../contracts/agent/index.ts";
import { howToStartAgent, whyTurnedAway } from "../../contracts/gateway/index.ts";
import { oneLine, plain } from "../../lib/plain/index.ts";
import { sizeWords } from "../../lib/text/index.ts";
import {
  type AgentEntry,
  agentEntries,
  agentNameOf,
  type Model,
  onceTriggersOf,
  partsOf,
  processesOf,
  processOutputKey,
  threadReferenceLabel,
  triggerFile,
} from "../state/index.ts";
import type { LevelOptions } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { elapsedOf, whenOf } from "./time.ts";
import { type OutputShown, outputShown } from "./work.ts";
import {
  EMPTY,
  FACTS,
  homeNote,
  machineLine,
  noTriggers,
  NOT_RUNNING,
  notLinkedNote,
  triggerWhen,
  TURNED_AWAY_FOR_RELEASE,
  turnedAwayNote,
  waitingOnLine,
  workingAt,
  yesNo,
} from "./words.ts";

/** One fact on an agent's page: what it is called, what it is, and a line under it, if it has one. */
export interface Fact {
  label: string;
  value: string;
  sub: string | undefined;
  /** It says that the agent is working, and is drawn as work is. */
  working: boolean;
}

/** A running background command shown on its agent's page above the triggers. */
export interface ProcessCard {
  id: string;
  agent: string;
  command: string;
  since: string;
  started: string;
  threadId: string;
  threadLabel: string;
  /** Output lines once fetched, or why they couldn't be read, or undefined before fetched. */
  output: OutputShown | undefined;
}

/** A standing trigger of the agent's, as its page shows it: its file, schedule status, and where it goes. */
export interface TriggerCard {
  name: string;
  agent: string;
  on: boolean;
  /** Its file, by its path in the home, which heads it. */
  path: string;
  file: { front: string[] | undefined; body: string } | { note: string } | undefined;
  when: string;
  /** The thread it comes to, or the breadcrumb note file it writes when `thread` is null. */
  target: { kind: "thread"; threadId: string; label: string } | { kind: "file"; path: string };
}

/** A pending one-shot trigger shown under standing triggers on the agent's page. */
export interface OnceCard {
  id: string;
  agent: string;
  when: string;
  prompt: string;
  threadId: string;
  threadLabel: string;
}

/** A line of the tree of an agent's home. */
export interface HomeRow {
  path: string;
  name: string;
  depth: number;
  kind: "folder" | "file" | "other" | "empty" | "note";
  open: boolean;
}

/**
 * An agent's page, which stands where a thread would while none is open: how
 * the agent stands and where it lives, then, while it runs, its background
 * processes, its standing and one-shot triggers, and its home.
 */
export interface PageLevel {
  agent: string;
  name: string;
  look: Look;
  off: boolean;
  facts: Fact[];
  note: string | undefined;
  /** Running background commands of this agent, oldest first. */
  processes: ProcessCard[];
  /** Standing triggers, in order of name, once the agent has said which it has. */
  triggers: TriggerCard[] | undefined;
  /** Pending one-shot triggers, soonest first. */
  once: OnceCard[];
  noTriggers: string;
  home: HomeRow[];
  notes: string[];
}

export interface PageOptions extends LevelOptions {
  /** The folders of the home that are open, by their paths there. */
  opened: ReadonlySet<string>;
}

const PARTS = ["SOUL.md", "context", "skills", "vault", "breadcrumbs"];
const NOT_LISTED = new Set(["agent.json", "triggers", "state"]);

export function pageLevel(model: Model, options: PageOptions): PageLevel | undefined {
  const { list } = model.open;
  if (list?.kind !== "agent") return undefined;
  const id = list.id;
  const name = agentNameOf(model, id);
  const entry = agentEntries(model).find((each) => each.id === id);
  const member = model.listing?.members.find((each) => each.id === id);
  const where = member?.where ?? null;
  const running = entry?.running === true;
  const away = entry?.away;
  const stale = model.gateway.state === "down" && model.listing !== undefined;
  const gateway = model.listing?.machine;
  const machine = where?.machine ?? model.listing?.programs.find((program) => program.kind === "agent" && program.member === id)?.machine;
  const lastLinked = !running && away === undefined && member?.lastLinked !== null && member?.lastLinked !== undefined ? whenOf(member.lastLinked, options.now) : undefined;

  const facts: Fact[] = [standing(model, entry, stale), { label: FACTS.admin, value: yesNo(member?.admin === true), sub: undefined, working: false }];
  if (machine !== undefined) {
    const gateways = gateway !== undefined && gateway.host === machine.host;
    facts.push({ label: FACTS.machine, value: oneLine(machine.host), sub: machineLine(machine, gateways, lastLinked), working: false });
  }
  if (running && model.defaultModel !== undefined) facts.push({ label: FACTS.model, value: modelWords(model.defaultModel), sub: undefined, working: false });
  const version = running ? entry.version : away?.shrimpy;
  if (version !== undefined) facts.push({ label: FACTS.version, value: oneLine(version), sub: undefined, working: false });
  if (where !== null) facts.push({ label: FACTS.home, value: oneLine(where.home), sub: undefined, working: false });

  const why = away === undefined || model.listing?.versions === undefined ? undefined : whyTurnedAway(away, model.listing.versions);
  const note = running ? undefined : why === undefined ? notLinkedNote(name, machine?.host, howToStartAgent(name, model.homes?.(name))) : turnedAwayNote(why);
  const admins = (model.listing?.members ?? []).filter((each) => each.kind === "agent" && each.admin && each.id !== id).map((each) => each.name);

  const processes: ProcessCard[] =
    running && !stale
      ? processesOf(model, id).map((proc) => ({
          id: oneLine(proc.id),
          agent: id,
          command: oneLine(proc.command),
          since: elapsedOf(proc.startedAt, options.now),
          started: whenOf(proc.startedAt, options.now),
          threadId: proc.threadId,
          threadLabel: oneLine(threadReferenceLabel(model, id, proc.threadId)),
          output: outputShown(model.processOutputs[processOutputKey(id, proc.id)], name, options.self),
        }))
      : [];

  const once: OnceCard[] =
    running && !stale
      ? onceTriggersOf(model, id).map((trigger) => ({
          id: trigger.id,
          agent: id,
          when: whenOf(trigger.due, options.now),
          prompt: oneLine(onceTriggerPrompt(trigger)),
          threadId: trigger.threadId,
          threadLabel: oneLine(threadReferenceLabel(model, id, trigger.threadId)),
        }))
      : [];

  return {
    agent: id,
    name: oneLine(name),
    look: lookOf(model, id),
    off: !running,
    facts,
    note,
    processes,
    triggers: running ? model.triggers?.map((trigger) => card(model, id, trigger, options.now, name, options.self)) : undefined,
    once,
    noTriggers: noTriggers(name, admins.sort((a, b) => a.localeCompare(b))),
    home: running ? tree(model, name, options) : [],
    notes: notesOf(model, { agent: id, watching: true, looking: running ? "sessions" : undefined, refused: undefined, notice: false }, options.self),
  };
}

function standing(model: Model, entry: AgentEntry | undefined, stale: boolean): Fact {
  const fact = { label: FACTS.state, sub: undefined };
  if (entry?.running !== true) return { ...fact, value: entry?.away === undefined ? NOT_RUNNING : TURNED_AWAY_FOR_RELEASE, working: false };
  if (stale) return { ...fact, value: "idle", working: false };
  const waiting = entry.waiting.length > 0 ? waitingOnLine(entry.waiting, true) : undefined;
  if (!entry.working) return { ...fact, value: waiting ?? "idle", working: false };
  const working = partsOf(model, entry.id).filter((part) => part.working);
  const places = working.flatMap((part) => (part.yours ? [YOUR_DM] : part.place === null ? [] : [placeLabel(part.place, model.me?.name)]));
  return { ...fact, value: workingAt([...new Set(places)]), sub: waiting, working: true };
}

function card(model: Model, agentId: string, trigger: TriggerSummary, now: number, agent: string, self: string): TriggerCard {
  const path = triggerFile(trigger.name);
  const when = triggerWhen(trigger, now);
  const target: TriggerCard["target"] =
    trigger.thread !== null
      ? { kind: "thread", threadId: trigger.thread, label: oneLine(threadReferenceLabel(model, agentId, trigger.thread)) }
      : { kind: "file", path: `breadcrumbs/${trigger.name}.md` };
  const read = model.home.files[path];
  if (read === undefined) return { name: trigger.name, agent: agentId, on: trigger.on, path, file: undefined, when, target };
  if ("problem" in read) return { name: trigger.name, agent: agentId, on: trigger.on, path, file: { note: homeNote(agent, read.problem, self) }, when, target };
  return {
    name: trigger.name,
    agent: agentId,
    on: trigger.on,
    path,
    file: read.value.kind === "text" ? frontAndBody(plain(read.value.text)) : { front: undefined, body: "" },
    when,
    target,
  };
}

function frontAndBody(text: string): { front: string[] | undefined; body: string } {
  const lines = text.split("\n");
  const end = lines.findIndex((line, at) => at > 0 && line.trimEnd() === "---");
  if (lines[0]?.trimEnd() !== "---" || end === -1) return { front: undefined, body: text.trim() };
  return { front: lines.slice(1, end), body: lines.slice(end + 1).join("\n").trim() };
}

function tree(model: Model, agent: string, options: PageOptions): HomeRow[] {
  const rows: HomeRow[] = [];
  const walk = (path: string, depth: number): void => {
    const read = model.home.folders[path];
    if (read === undefined) return;
    if ("problem" in read) {
      rows.push({ path, name: homeNote(agent, read.problem, options.self), depth, kind: "note", open: false });
      return;
    }
    const entries = path === "" ? topOf(read.value) : [...read.value].sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder"));
    if (entries.length === 0) rows.push({ path, name: EMPTY, depth, kind: "empty", open: false });
    for (const entry of entries) {
      const full = path === "" ? entry.name : `${path}/${entry.name}`;
      const open = entry.kind === "folder" && options.opened.has(full);
      rows.push({ path: full, name: oneLine(entry.name), depth, kind: entry.kind, open });
      if (open) walk(full, depth + 1);
    }
  };
  walk("", 0);
  return rows;
}

function topOf(entries: readonly HomeEntry[]): HomeEntry[] {
  const parts = PARTS.flatMap((name) => entries.filter((entry) => entry.name === name));
  const rest = entries.filter((entry) => !PARTS.includes(entry.name) && !NOT_LISTED.has(entry.name));
  return [...parts, ...rest.sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder"))];
}

export interface FileLevel {
  name: string;
  look: Look;
  path: string;
  size: string | undefined;
  shown: { kind: "text"; text: string } | { kind: "image"; mediaType: string; data: string } | { kind: "empty" } | { kind: "note"; note: string } | undefined;
}

export function fileLevel(model: Model, path: string, self: string): FileLevel | undefined {
  const { list } = model.open;
  if (list?.kind !== "agent") return undefined;
  const name = agentNameOf(model, list.id);
  const at = path.lastIndexOf("/");
  const folder = model.home.folders[at === -1 ? "" : path.slice(0, at)];
  const entry = folder !== undefined && "value" in folder ? folder.value.find((each) => each.name === path.slice(at + 1)) : undefined;
  const file = model.home.files[path];
  let shown: FileLevel["shown"];
  if (file !== undefined && "problem" in file) shown = { kind: "note", note: homeNote(name, file.problem, self) };
  else if (file?.value.kind === "image") shown = { kind: "image", mediaType: file.value.mediaType, data: file.value.data };
  else if (file !== undefined) shown = file.value.text === "" ? { kind: "empty" } : { kind: "text", text: plain(file.value.text) };
  return {
    name: oneLine(name),
    look: lookOf(model, list.id),
    path: oneLine(path),
    size: entry?.size === null || entry?.size === undefined ? undefined : sizeWords(entry.size),
    shown,
  };
}
