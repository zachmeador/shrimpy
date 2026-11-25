import { type HomeEntry, modelWords, placeLabel, YOUR_DM } from "../../contracts/agent/index.ts";
import { howToStartAgent, whyTurnedAway } from "../../contracts/gateway/index.ts";
import { oneLine, plain } from "../../lib/plain/index.ts";
import { sizeWords } from "../../lib/text/index.ts";
import { type AgentEntry, agentEntries, agentNameOf, type Model, partsOf, triggerFile } from "../state/index.ts";
import type { LevelOptions } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { whenOf } from "./time.ts";
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

/** A trigger of the agent's, as its page shows it: its file, and when it runs next and how it last went. */
export interface TriggerCard {
  /** Its file, by its path in the home, which heads it. */
  path: string;
  /**
   * What its file says, once it has been read: the lines of its front matter,
   * between the two `---` lines, when it has any, and what follows; or why it
   * could not be read.
   */
  file: { front: string[] | undefined; body: string } | { note: string } | undefined;
  when: string;
}

/** A line of the tree of an agent's home: a folder, open or shut, a file, something that is neither, or what stands in an open folder that holds nothing or could not be read. */
export interface HomeRow {
  /** Where it is in the home: what the state reads it by, and what a client opens. */
  path: string;
  name: string;
  depth: number;
  kind: "folder" | "file" | "other" | "empty" | "note";
  /** A folder is open, with what is in it on the lines after it. */
  open: boolean;
}

/**
 * An agent's page, which stands where a thread would while none is open: how
 * the agent stands and where it lives, then, while it runs, its triggers and
 * its home, or why those can't be read.
 */
export interface PageLevel {
  name: string;
  look: Look;
  /** The agent is not linked to the gateway, so it takes no thread and its home can't be read. */
  off: boolean;
  /** How it stands, whether it is an admin, its machine, its model and version while they are known, and its home. */
  facts: Fact[];
  /** Why its triggers and its home are not shown, while it is off: where it lives, or what to update. */
  note: string | undefined;
  /** Its triggers, in order of name, once it has said which it has. */
  triggers: TriggerCard[] | undefined;
  /** What stands in their place while it has none. */
  noTriggers: string;
  /** Its home as a tree, as far as it has been read: the parts every home has, then the rest of the top folder, and what is in each open folder. */
  home: HomeRow[];
  /** What is not working, or has just gone wrong, most pressing first. */
  notes: string[];
}

export interface PageOptions extends LevelOptions {
  /** The folders of the home that are open, by their paths there. */
  opened: ReadonlySet<string>;
}

/** The parts every home has, in the order the page lists them first. */
const PARTS = ["SOUL.md", "context", "skills", "vault", "breadcrumbs"];

/** What the page leaves out of the top of a home: what it shows already, `agent.json` and the triggers, and the program's own `state/`. */
const NOT_LISTED = new Set(["agent.json", "triggers", "state"]);

/** The page of the agent whose list is open, as plain text and facts, or none while no agent's list is. */
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
  // Who is an admin is the roster's to say.
  const admins = (model.listing?.members ?? []).filter((each) => each.kind === "agent" && each.admin && each.id !== id).map((each) => each.name);
  return {
    name: oneLine(name),
    look: lookOf(model, id),
    off: !running,
    facts,
    note,
    triggers: running ? model.triggers?.map((trigger) => card(model, triggerFile(trigger.name), triggerWhen(trigger, options.now), name, options.self)) : undefined,
    noTriggers: noTriggers(name, admins.sort((a, b) => a.localeCompare(b))),
    home: running ? tree(model, name, options) : [],
    notes: notesOf(model, { agent: id, watching: true, looking: running ? "sessions" : undefined, refused: undefined, notice: false }, options.self),
  };
}

/**
 * How the agent stands: working, and where, each place by name, idle, not
 * running, or turned away for the release it runs. No one is said to work
 * while what is shown is `stale`.
 */
function standing(model: Model, entry: AgentEntry | undefined, stale: boolean): Fact {
  const fact = { label: FACTS.state, sub: undefined };
  if (entry?.running !== true) return { ...fact, value: entry?.away === undefined ? NOT_RUNNING : TURNED_AWAY_FOR_RELEASE, working: false };
  if (!entry.working || stale) return { ...fact, value: "idle", working: false };
  const working = partsOf(model, entry.id).filter((part) => part.working);
  const places = working.flatMap((part) => (part.yours ? [YOUR_DM] : part.place === null ? [] : [placeLabel(part.place, model.me?.name)]));
  return { ...fact, value: workingAt([...new Set(places)]), working: true };
}

/** A trigger's card, with its file as far as it has been read. */
function card(model: Model, path: string, when: string, agent: string, self: string): TriggerCard {
  const read = model.home.files[path];
  if (read === undefined) return { path, file: undefined, when };
  if ("problem" in read) return { path, file: { note: homeNote(agent, read.problem, self) }, when };
  return { path, file: read.value.kind === "text" ? frontAndBody(plain(read.value.text)) : { front: undefined, body: "" }, when };
}

/** A Markdown file's front matter, the lines between its first two `---` lines, and what follows, or all of it as what follows where it has none. */
function frontAndBody(text: string): { front: string[] | undefined; body: string } {
  const lines = text.split("\n");
  const end = lines.findIndex((line, at) => at > 0 && line.trimEnd() === "---");
  if (lines[0]?.trimEnd() !== "---" || end === -1) return { front: undefined, body: text.trim() };
  return { front: lines.slice(1, end), body: lines.slice(end + 1).join("\n").trim() };
}

/** The home as a tree, from what has been read of it: each folder's entries, folders first, the top's parts first of all. */
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

/** The top of a home as the page lists it: the parts every home has, in their order, then the rest, folders first, but for what the page shows already and the program's own. */
function topOf(entries: readonly HomeEntry[]): HomeEntry[] {
  const parts = PARTS.flatMap((name) => entries.filter((entry) => entry.name === name));
  const rest = entries.filter((entry) => !PARTS.includes(entry.name) && !NOT_LISTED.has(entry.name));
  return [...parts, ...rest.sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder"))];
}

/** A file of an agent's home, as it opens where the agent's page was. */
export interface FileLevel {
  /** Whose home it is in, and how that agent looks. */
  name: string;
  look: Look;
  path: string;
  /** How big it is, as its folder lists it, once that has been read. */
  size: string | undefined;
  /** What it holds, once it has been read: its text, a picture, nothing, or why it could not be read. */
  shown: { kind: "text"; text: string } | { kind: "image"; mediaType: string; data: string } | { kind: "empty" } | { kind: "note"; note: string } | undefined;
}

/** The file at `path` in the home of the agent whose list is open, or none while no agent's list is. */
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
