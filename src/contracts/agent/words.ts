import { oneLine } from "../../lib/plain/index.ts";
import { withoutPeriod } from "../../lib/text/index.ts";
import { roomLabel } from "../chat/index.ts";
import type {
  AnswerEnding,
  ModelId,
  SessionActivity,
  SessionItem,
  SessionPlace,
  SessionStatus,
  ThreadPlace,
  ToolStatus,
  WaitingWakeup,
} from "./shapes.ts";

/*
 * How a session is said, the one way the terminal and the commands say it:
 * what it is doing, where it is, how a tool call or an answer stands, where it
 * was reset, an image it was shown, its model, what it has used and a wake-up
 * it waits on. Each client frames these words its own way. A name, an ID or a
 * note that came from another program is put on one line and made harmless
 * here, whoever calls.
 */

/** What a session is doing: "idle", "working", "answering", "running bash" or "retrying after: …". */
export function activityWords(activity: SessionActivity): string {
  switch (activity.kind) {
    case "idle":
      return "idle";
    case "working":
      return "working";
    case "answering":
      return "answering";
    case "tool":
      return `running ${oneLine(activity.name)}`;
    case "retrying":
      return `retrying after: ${oneLine(activity.error)}`;
  }
}

/** The DM of whoever looks with the agent, as a place says it is theirs. */
export const YOUR_DM = "your DM";

/**
 * Where a session is, without which thread of it: "DM with mechanic", "#ops"
 * or "trigger nightly". `you` is the name of whoever looks, when it is known:
 * their own DM with the agent is "your DM".
 */
export function placeLabel(place: SessionPlace, you?: string): string {
  switch (place.kind) {
    case "dm":
      return place.with.kind === "person" && place.with.name === you ? YOUR_DM : `DM with ${oneLine(place.with.name)}`;
    case "room":
      return roomLabel(place.room);
    case "trigger":
      return `trigger ${oneLine(place.trigger)}`;
  }
}

/** A thread of a session's place: by its name, marked when it is the main one, or "main", or by its address when it has no name. */
export function threadLabel(thread: ThreadPlace, address: string): string {
  const name = thread.name === null ? "" : oneLine(thread.name);
  if (name !== "") return thread.main ? `${name} [main]` : name;
  return thread.main ? "main" : `thread ${oneLine(address)}`;
}

/** Where a session is, with which thread of it: "DM with mechanic · main", "#ops · deploys" or "trigger nightly". */
export function placeWords(place: SessionPlace, address: string, you?: string): string {
  return place.kind === "trigger" ? placeLabel(place, you) : `${placeLabel(place, you)} · ${threadLabel(place.thread, address)}`;
}

/** How a tool call stands: "waiting", "running", "done", "failed" or "interrupted, not run again". */
export function toolStatusWords(status: ToolStatus): string {
  switch (status) {
    case "pending":
      return "waiting";
    case "running":
      return "running";
    case "done":
      return "done";
    case "error":
      return "failed";
    case "interrupted":
      return "interrupted, not run again";
  }
}

/** How an answer ended that did not end the way an answer does, or nothing when it did. */
export function endingWords(ended: AnswerEnding | undefined): string | undefined {
  if (ended === "interrupted") return "interrupted";
  if (ended === "failed") return "failed";
  return undefined;
}

/** What marks where a session was reset or compacted. */
export const markerWords = (marker: Extract<SessionItem, { type: "marker" }>["marker"]): string =>
  marker === "reset" ? "session reset" : "session compacted";

/** An image the model was shown, named by its media type. */
export const imageWords = (mimeType: string): string => `[image: ${oneLine(mimeType)}]`;

/** A model as Shrimpy writes it, and as `/model` and `--model` take it: its provider, a slash and its ID. */
export const modelWords = (model: ModelId): string => `${oneLine(model.provider)}/${oneLine(model.id)}`;

/** What a session has used: "1,234 tokens in, 56 out, cost $0.0012". */
export function usageWords(usage: SessionStatus["usage"]): string {
  const count = (tokens: number): string => tokens.toLocaleString("en-US");
  return `${count(usage.input)} tokens in, ${count(usage.output)} out, cost $${usage.cost.toFixed(4)}`;
}

/** A wake-up a session waits on: when it comes, as `when` writes it, and the note it brings. */
export const wakeupWords = (wakeup: WaitingWakeup, when: string): string =>
  `Checks back at ${when}: ${withoutPeriod(oneLine(wakeup.note))}`;
