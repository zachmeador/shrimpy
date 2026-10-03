import type { RoutedServerPresentation } from "@earendil-works/pi-server";
import type { Chat, Member } from "../contracts/chat/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import { member as checkMember } from "./input/index.ts";
import { feed, head } from "./offers/index.ts";
import {
  archiveThread,
  type ChatDeps,
  createThread,
  identify,
  listChannels,
  listThreads,
  markSkipped,
  openDm,
  post,
  readMessages,
  renameThread,
  setWorking,
  watchableThread,
} from "./threads/index.ts";

/** What one connection to the chat server is: its `Chat`, and how to let go of what it leaves behind. */
export interface ServedChat {
  readonly chat: Chat;
  /** The connection is over: forget who is working because of it. */
  end(): void;
}

/**
 * The `Chat` one connection talks to. The connection holds who it is and which
 * thread it watches; nothing else in the chat server remembers a connection.
 * Until it says who it is, every call but `identify` is refused.
 */
export function serveChat(deps: ChatDeps, presentation: RoutedServerPresentation): ServedChat {
  let who: Member | undefined;
  // Stands for this connection in the working marks it makes.
  const connection = {};
  const caller = (): Member =>
    who ?? refuse("Say who you are with identify before anything else.", "service_not_allowed");

  const chat: Chat = {
    async identify(claimed) {
      const member = checkMember(claimed, "member");
      if (who !== undefined && who.id !== member.id) {
        refuse(`This connection is already identified as ${who.id}.`);
      }
      who = identify(deps, member);
    },
    async channels() {
      return listChannels(deps, caller());
    },
    async openDm(other) {
      return openDm(deps, caller(), other);
    },
    async threads(channelId) {
      return listThreads(deps, caller(), channelId);
    },
    async createThread(channelId, name) {
      return createThread(deps, caller(), channelId, name);
    },
    async renameThread(threadId, name) {
      return renameThread(deps, caller(), threadId, name);
    },
    async archiveThread(threadId, archived) {
      return archiveThread(deps, caller(), threadId, archived);
    },
    async post(threadId, text, requestId) {
      return post(deps, caller(), threadId, text, requestId);
    },
    async read(threadId, beforeSeq, limit) {
      return readMessages(deps, caller(), threadId, beforeSeq, limit);
    },
    async markSkipped(messageIds) {
      markSkipped(deps, caller(), messageIds);
    },
    async setWorking(threadId, working) {
      setWorking(deps, connection, caller(), threadId, working);
    },
    async head() {
      caller();
      return head(deps.store);
    },
    async feed(cursor, limit, context) {
      return feed(deps.store, caller(), cursor, limit, context);
    },
    async attach(threadId, context) {
      await presentation.attachSession(watchableThread(deps, caller(), threadId), context);
    },
    async detach(context) {
      caller();
      await presentation.detachSession(context);
    },
  };
  return { chat, end: () => deps.working.end(connection) };
}
