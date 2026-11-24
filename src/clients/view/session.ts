import { placeLabel, YOUR_DM } from "../../contracts/agent/index.ts";
import { titleOf } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { agentNameOf, agentRuns, type Model, type Place, type SessionView, sidesOf } from "../state/index.ts";
import { BRIEF, type LevelOptions, type Looking, lookingAt, OUTPUT_LINES } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { type About, notesOf } from "./notes.ts";
import { type Step, watchOf } from "./work.ts";
import { behindThread, earlierItems, type InFull, NOT_RUNNING, placeWords, SESSION_EMPTY, sessionFoot, sessionTitle, watchingWords } from "./words.ts";

/** An agent whose view of the session behind the open thread can be put on show. */
export interface Side {
  /** The agent's member ID. */
  agent: string;
  name: string;
  look: Look;
}

/**
 * The session on show, as its agent sees it: the open session behind no
 * thread, which is a trigger's own, or the one behind the open thread, on show
 * in place of the conversation. It is for watching: nothing is said or done in
 * it.
 */
export interface SessionLevel {
  title: string;
  /** Whose session it is: the agent's name, as `title` has it first. */
  who: string;
  /** What is watched, as `title` has it after `who`. */
  watching: string;
  /** Said when there are older items than the ones shown, or when there are none to show. */
  lead: string | undefined;
  /** The newest items of the session, oldest first: what it was shown, what it thought and wrote, and each tool call. */
  steps: Step[];
  /**
   * Under the session behind the open thread: what it is doing, how many
   * inputs wait, its model and what it has used, or that the agent is not
   * running. A trigger's own session has none.
   */
  foot: string | undefined;
  /** The agents whose view of the open thread can be on show, in the order they come, this one among them. None for a trigger's own session. */
  sides: Side[];
  /** What is shown may be out of date: the agent is not being reached. */
  stale: boolean;
  /** Whose session it is, by member ID. */
  agent: string;
  /** How that agent looks. */
  look: Look;
  /** It is the session behind the open thread, on show in place of its conversation, which can be put back. */
  turned: boolean;
  /** What is not working, or has just gone wrong, most pressing first. */
  notes: string[];
}

export interface SessionOptions extends LevelOptions {
  /** What is shown in full. Everything is brief when this is left out. */
  inFull?: InFull;
  /** How many of a tool's last lines a brief call shows. */
  outputLines?: number;
}

/** The session on show, as plain text and facts, or none while no session is. */
export function sessionLevel(model: Model, options: SessionOptions): SessionLevel | undefined {
  const { item } = model.open;
  if (item?.kind === "session") {
    const summary = model.sessions?.find((each) => each.id === item.session);
    const watching = watchingWords(placeWords(summary?.place ?? null, item.session, model.me?.name));
    const refused = model.watchRefusal === undefined ? undefined : { what: "session" as const, words: model.watchRefusal };
    return sessionOf(model, item.agent, item.session, model.watched, { watching, turned: false, refused }, options);
  }
  if (item?.kind === "thread" && item.side !== undefined && item.thread !== undefined) {
    const here = lookingAt(model, item.place);
    const threadId = item.thread;
    const thread = (model.thread?.thread.id === threadId ? model.thread.thread : undefined) ?? here.threads.find((each) => each.id === threadId);
    const where = placeFor(model, item.place, here, item.side);
    const roomMain = thread?.main === true && item.place.kind !== "agent" && here.channel?.kind === "room";
    const watching = watchingWords(behindThread(where, roomMain, thread === undefined ? threadId : titleOf(thread)));
    return sessionOf(model, item.side, threadId, model.behind[item.side], { watching, turned: true, refused: undefined }, options);
  }
  return undefined;
}

/** Where a thread is, as the list of the agent `viewer` says it: "your DM", "#ops" or "DM with mechanic". */
function placeFor(model: Model, place: Place, here: Looking, viewer: string): string {
  if (place.kind === "agent") return YOUR_DM;
  const channel = here.channel;
  if (channel?.kind !== "dm") return here.label;
  const other = channel.members.find((member) => member.id !== viewer);
  if (other === undefined) return here.label;
  return placeLabel({ kind: "dm", with: { name: other.name, kind: other.kind }, thread: { main: false, name: null } }, model.me?.name);
}

/** A session as `agentId` sees it, by its address, with what `frame` says of where it is on show. */
function sessionOf(
  model: Model,
  agentId: string,
  address: string,
  view: SessionView | undefined,
  frame: { watching: string; turned: boolean; refused: About["refused"] },
  options: SessionOptions,
): SessionLevel {
  const name = agentNameOf(model, agentId);
  // A session that was working when the agent went away is not working now, whatever its last view says.
  const away = view?.reached === false;
  const busy = view?.status.busy === true && !away;
  const watched = view === undefined ? undefined : watchOf(view, { inFull: options.inFull ?? BRIEF, outputLines: options.outputLines ?? OUTPUT_LINES });

  let lead: string | undefined;
  if (watched !== undefined && watched.earlier) lead = earlierItems(address, name);
  else if (view !== undefined && view.items.length === 0) lead = SESSION_EMPTY;

  let foot: string | undefined;
  if (frame.turned) {
    foot = !agentRuns(model, agentId) ? NOT_RUNNING : view === undefined ? undefined : sessionFoot(view.status, busy);
  }

  const who = oneLine(name);
  return {
    title: sessionTitle(who, frame.watching),
    who,
    watching: frame.watching,
    lead,
    steps: watched?.steps ?? [],
    foot,
    sides: frame.turned ? sidesOf(model).map((agent) => ({ agent, name: oneLine(agentNameOf(model, agent)), look: lookOf(model, agent) })) : [],
    stale: away,
    agent: agentId,
    look: lookOf(model, agentId),
    turned: frame.turned,
    notes: notesOf(model, { agent: agentId, watching: true, looking: "sessions", refused: frame.refused, notice: true }, options.self),
  };
}
