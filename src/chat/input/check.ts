import type { Receipt, WakeLineInput } from "../../contracts/chat/index.ts";
import { fitName, NAME_RULE } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { MAX_DETAIL, MAX_ID, MAX_LINE, MAX_TEXT } from "./limits.ts";

// Arguments arrive off the wire, so their TypeScript types promise nothing. Each
// check refuses with a message that names the argument as `what`.

/** An ID: one word, with no spaces or control characters. */
export function identifier(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[^\s\p{Cc}]+$/u.test(value) || value.length > MAX_ID) {
    refuse(`${what} must be an ID of 1 to ${MAX_ID} characters with no spaces.`);
  }
  return value;
}

/** A name for display, as every program keeps one: one line, and trimmed. */
export function label(value: unknown, what: string): string {
  return (typeof value === "string" ? fitName(value) : undefined) ?? refuse(`${what} ${NAME_RULE}.`);
}

/** The text of a message, exactly as sent. */
export function messageText(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") refuse("A message needs some text.");
  if (value.length > MAX_TEXT) {
    refuse(`A message holds at most ${MAX_TEXT} characters, and this one has ${value.length}.`);
  }
  return value;
}

/** One part of a wake line: text of at most `MAX_LINE` characters, which may be empty. */
function linePart(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length > MAX_LINE) refuse(`${what} must be text of at most ${MAX_LINE} characters.`);
  return value;
}

const PROCESS_STATES = { exited: true, killed: true, checkin: true, interrupted: true } as const;
const ANSWER_STATUSES = { answered: true, silent: true, stopped: true, failed: true } as const;

/** A wake line off the wire: trigger, process, or answer. */
export function wakeLine(value: unknown): WakeLineInput {
  if (typeof value !== "object" || value === null) refuse("wake must be a trigger, process, or answer line.");
  const raw = value as Record<string, unknown>;
  switch (raw.kind) {
    case "trigger":
      return {
        kind: "trigger",
        name: raw.name === null ? null : label(raw.name, "The trigger's name"),
        firedAt: whole(raw.firedAt, "firedAt", 0),
        prompt: linePart(raw.prompt, "The trigger's prompt"),
        output: raw.output === null ? null : linePart(raw.output, "What the trigger's check printed"),
      };
    case "process": {
      const state = raw.state;
      if (typeof state !== "string" || !Object.hasOwn(PROCESS_STATES, state)) {
        refuse('wake.state must be "exited", "killed", "checkin" or "interrupted".');
      }
      const command = linePart(raw.command, "The command");
      if (command.trim() === "") refuse("The command must not be empty.");
      if (raw.code !== null && (typeof raw.code !== "number" || !Number.isSafeInteger(raw.code))) {
        refuse("code must be a whole number or null.");
      }
      return {
        kind: "process",
        id: identifier(raw.id, "The process ID"),
        command,
        state: state as keyof typeof PROCESS_STATES,
        code: raw.code as number | null,
        afterMs: whole(raw.afterMs, "afterMs", 0),
        at: whole(raw.at, "at", 0),
        output: raw.output === null ? null : linePart(raw.output, "The process output"),
      };
    }
    case "answer": {
      const status = raw.status;
      if (typeof status !== "string" || !Object.hasOwn(ANSWER_STATUSES, status)) {
        refuse('wake.status must be "answered", "silent", "stopped" or "failed".');
      }
      return {
        kind: "answer",
        from: identifier(raw.from, "from"),
        thread: identifier(raw.thread, "thread"),
        status: status as keyof typeof ANSWER_STATUSES,
        at: whole(raw.at, "at", 0),
      };
    }
    default:
      refuse('wake.kind must be "trigger", "process" or "answer".');
  }
}

// Built from a string because TypeScript's target does not know the `v` flag; the runtime does.
const ONE_EMOJI = new RegExp("^\\p{RGI_Emoji}$", "v");

/**
 * A reaction: one emoji. The same emoji is always the same reaction, so one
 * written without its variation selector, such as a bare heart, is kept in
 * the form with it.
 */
export function emoji(value: unknown, what: string): string {
  if (typeof value === "string") {
    if (ONE_EMOJI.test(value)) return value;
    if (ONE_EMOJI.test(`${value}️`)) return `${value}️`;
  }
  return refuse(`${what} must be one emoji.`);
}

export function whole(value: unknown, what: string, least: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < least) {
    refuse(`${what} must be a whole number, ${least} or more.`);
  }
  return value;
}

export function flag(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") refuse(`${what} must be true or false.`);
  return value;
}

/** A list of IDs, `least` to `most` long, one at least unless said otherwise. */
export function identifiers(value: unknown, what: string, most: number, least = 1): string[] {
  if (!Array.isArray(value) || value.length < least || value.length > most) {
    refuse(`${what} must be a list of ${least} to ${most} IDs.`);
  }
  return value.map((item) => identifier(item, `${what} item`));
}

// Written as a record so the compiler flags a status added to `Receipt` but not here.
const STATUSES = {
  answered: true,
  silent: true,
  stopped: true,
  skipped: true,
  failed: true,
} satisfies Record<Receipt["status"], true>;

const isStatus = (value: unknown): value is Receipt["status"] =>
  typeof value === "string" && Object.hasOwn(STATUSES, value);

const absent = (value: unknown): boolean => value === undefined || value === null;

/**
 * What an agent says it did with messages: a status, and the reply or reason
 * that goes with it. Only an answered receipt has a reply. A failed one always
 * has a detail, and a skipped or answered one may; the others carry null in
 * both. A reply or detail left out counts as null.
 */
export function receipt(value: unknown, what: string): Omit<Receipt, "memberId" | "event"> {
  if (typeof value !== "object" || value === null) {
    refuse(`${what} must be a receipt: a status, a reply and a detail.`);
  }
  const { status, reply, detail } = value as Record<string, unknown>;
  if (!isStatus(status)) {
    refuse(`${what}.status must be "answered", "silent", "stopped", "skipped" or "failed".`);
  }
  if (status === "answered" && absent(reply)) {
    refuse("An answered receipt needs a reply: the ID of the message that answers it.");
  }
  if (status !== "answered" && !absent(reply)) {
    refuse(`Only an answered receipt has a reply, and this one is ${status}.`);
  }
  if ((status === "silent" || status === "stopped") && !absent(detail)) {
    refuse(`Only a failed, skipped or answered receipt has a detail, and this one is ${status}.`);
  }
  if (status === "failed" && absent(detail)) {
    refuse("A failed receipt needs a detail: a short reason a person can read.");
  }
  return {
    status,
    reply: status === "answered" ? identifier(reply, `${what}.reply`) : null,
    detail: absent(detail) ? null : reason(detail, `${what}.detail`),
  };
}

/** A receipt's reason, as text a person can read. */
function reason(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") refuse(`${what} must be some text, or null.`);
  if (value.length > MAX_DETAIL) {
    refuse(`${what} holds at most ${MAX_DETAIL} characters, and this one has ${value.length}.`);
  }
  return value;
}
