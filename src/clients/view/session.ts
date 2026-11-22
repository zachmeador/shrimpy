import { titleOf } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { agentNameOf, type Model, type SessionView } from "../state/index.ts";
import { BRIEF, type LevelOptions, lookingAt } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { type About, notesOf } from "./notes.ts";
import { whenOf } from "./time.ts";
import { type Step, watchOf } from "./work.ts";
import {
  earlierItems,
  idleLine,
  type InFull,
  placeWords,
  queuedLine,
  SESSION_EMPTY,
  sessionTitle,
  wakeupLine,
  watchingWords,
  workingLine,
} from "./words.ts";

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
  /** What the session is doing now, when it is working. */
  working: string | undefined;
  /** Said when the session is not working. */
  idle: string | undefined;
  /** The input it has accepted and not picked up yet, a line each. */
  queued: string[];
  /** A line for each wake-up the session waits on, the soonest first, with when it comes. */
  waiting: string[];
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
    const named = thread === undefined ? oneLine(threadId) : titleOf(thread);
    // The title of a DM with the agent already has the agent's name in it, and any other conversation is named.
    const watching = watchingWords(item.place.kind === "agent" ? named : `${here.label} · ${named}`);
    return sessionOf(model, item.side, threadId, model.behind[item.side], { watching, turned: true, refused: undefined }, options);
  }
  return undefined;
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
  const watched = view === undefined ? undefined : watchOf(view, options.inFull ?? BRIEF);

  let lead: string | undefined;
  if (watched !== undefined && watched.earlier) lead = earlierItems(address, name);
  else if (view !== undefined && view.items.length === 0) lead = SESSION_EMPTY;

  const who = oneLine(name);
  return {
    title: sessionTitle(who, frame.watching),
    who,
    watching: frame.watching,
    lead,
    steps: watched?.steps ?? [],
    working: busy ? workingLine([name], view.status.activity, false) : undefined,
    idle: view !== undefined && !busy && !away ? idleLine(name) : undefined,
    queued: view?.status.queued.map(queuedLine) ?? [],
    // A watch takes no input, so how to cancel a wake-up is said where the person can write: in the thread.
    waiting: away ? [] : (view?.status.wakeups ?? []).map((wakeup) => wakeupLine(name, wakeup, whenOf(wakeup.due, options.now), false)),
    stale: away,
    agent: agentId,
    look: lookOf(model, agentId),
    turned: frame.turned,
    notes: notesOf(model, { agent: agentId, watching: true, looking: "sessions", refused: frame.refused, notice: true }, options.self),
  };
}
