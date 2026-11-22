import { oneLine } from "../../lib/plain/index.ts";
import { agentNameOf, type Model } from "../state/index.ts";
import { agentNote, chatNote, gatewayNote, noticeText, refusalNote, versionNote } from "./words.ts";

/** What a level shows, as far as what it says of how things stand depends on it. */
export interface About {
  /** The member ID of the agent whose list, work or session is on show, if any is. */
  agent: string | undefined;
  /** What is shown comes from the agent alone, as a session it shows does, so the chat server has nothing to do with it. */
  watching: boolean;
  /** What of the agent is on show, for what to say when it is not reached: its work beside a thread, or its sessions. */
  looking: "work" | "sessions" | undefined;
  /** What the agent said when it would not show what is on show: its sessions, or the session. */
  refused: { what: "sessions" | "session"; words: string } | undefined;
  /** What just happened is said here: it is where the person writes, or what is open in place of it. */
  notice: boolean;
}

/**
 * What the person should be told about how things stand, on a level that shows
 * what `about` says. A problem with the gateway comes first, since it explains
 * why the chat server or an agent can't be found; then the others, then a
 * version that differs, then what just happened. `self` is what the client
 * calls itself.
 */
export function notesOf(model: Model, about: About, self: string): string[] {
  const notes: string[] = [];
  const warn = (text: string | undefined): void => {
    if (text !== undefined) notes.push(text);
  };
  const agentId = about.agent;
  const agent = agentId === undefined ? undefined : agentNameOf(model, agentId);
  const gatewayDown = model.gateway.state === "down";
  if (model.gateway.state === "down") warn(gatewayNote(model.gateway.why));
  // The gateway being gone is why nothing is linked: that is not worth saying twice.
  if (!about.watching && model.chat.state === "down" && !(gatewayDown && model.chat.why.kind === "not-linked")) warn(chatNote(model.chat.why));
  if (about.looking !== undefined && agent !== undefined && model.agent?.state === "down" && !(gatewayDown && model.agent.why.kind === "not-linked")) {
    warn(agentNote(oneLine(agent), model.agent.why, about.looking, model.homes?.(agent)));
  }
  if (about.refused !== undefined && agent !== undefined) warn(refusalNote(about.refused.what, agent, about.refused.words));

  warn(model.listing === undefined || model.listing.version === "" ? undefined : versionNote("the gateway", model.listing.version, self));
  const linked = model.listing?.programs ?? [];
  const chat = linked.findLast((program) => program.kind === "chat");
  warn(chat === undefined ? undefined : versionNote("the chat server", chat.shrimpy, self));
  const running = agentId === undefined ? undefined : linked.findLast((program) => program.kind === "agent" && program.member === agentId);
  warn(running === undefined ? undefined : versionNote(`the agent ${oneLine(agent ?? "")}`, running.shrimpy, self));

  if (about.notice && model.notice !== undefined) warn(noticeText(model.notice, oneLine(agent ?? "")));
  return notes;
}
