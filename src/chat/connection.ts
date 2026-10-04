import type { RoutedServerPresentation } from "@earendil-works/pi-server";
import type { Chat, Member } from "../contracts/chat/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import { feed, head } from "./offers/index.ts";
import {
  archiveThread,
  type ChatDeps,
  createThread,
  enter,
  leaveReceipt,
  listChannels,
  listThreads,
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
 * Until it has come in with a ticket, every call but `enter` is refused.
 */
export function serveChat(deps: ChatDeps, presentation: RoutedServerPresentation): ServedChat {
  let who: Member | undefined;
  let entering = false;
  // Stands for this connection in the working marks it makes.
  const connection = {};
  const caller = (): Member =>
    who ?? refuse("Come in with a ticket from the gateway, with enter, before anything else.", "service_not_allowed");

  const chat: Chat = {
    async enter(ticket) {
      if (who !== undefined || entering) refuse("This connection has entered already.");
      entering = true;
      try {
        who = await enter(deps, ticket);
        return who;
      } finally {
        entering = false;
      }
    },
    async channels() {
      return listChannels(deps, caller());
    },
    async openDm(otherId) {
      return openDm(deps, caller(), otherId);
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
    async leaveReceipt(messageIds, receipt) {
      leaveReceipt(deps, caller(), messageIds, receipt);
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
