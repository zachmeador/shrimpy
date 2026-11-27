import type { Member } from "../../contracts/chat/index.ts";
import { identifier } from "../input/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { readableMessage } from "./access.ts";
import type { ChatDeps } from "./deps.ts";

/**
 * Whether chat keeps read marks for the caller: for you, in every thread you
 * read. An agent keeps none, since its place in its feed says what it has
 * taken.
 */
export const keepsMarks = (caller: Member): boolean => caller.kind === "person";

/**
 * Move the caller's read mark in a message's thread up to that message, in a
 * channel it reads, whether or not it is in it. A mark only moves forward, so
 * a message at or before it changes nothing.
 */
export function markRead(deps: ChatDeps, caller: Member, messageId: unknown): null {
  if (!keepsMarks(caller)) refuse("Only a person keeps read marks.");
  const id = identifier(messageId, "message");
  deps.store.transaction((tx) => {
    const { message } = readableMessage(tx, deps, caller, id);
    tx.markRead(caller.id, message);
  });
  return null;
}
