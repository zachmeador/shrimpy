import type { RoutedServerPresentation } from "@earendil-works/pi-server";
import type { Chat, Member } from "../contracts/chat/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import { feed, head } from "./offers/index.ts";
import {
  addMembers,
  archiveThread,
  type ChatDeps,
  createRoom,
  createThread,
  deleteMessage,
  editMessage,
  enter,
  leaveReceipt,
  listChannels,
  listThreads,
  openDm,
  post,
  react,
  readMessages,
  renameThread,
  setWorking,
  unreact,
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
    async createRoom(name, memberIds) {
      return createRoom(deps, caller(), name, memberIds);
    },
    async addMembers(channelId, memberIds) {
      return addMembers(deps, caller(), channelId, memberIds);
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
    async edit(messageId, text) {
      return editMessage(deps, caller(), messageId, text);
    },
    async delete(messageId) {
      return deleteMessage(deps, caller(), messageId);
    },
    async react(messageId, emoji) {
      return react(deps, caller(), messageId, emoji);
    },
    async unreact(messageId, emoji) {
      return unreact(deps, caller(), messageId, emoji);
    },
    async read(threadId, beforeSeq, limit) {
      return readMessages(deps, caller(), threadId, beforeSeq, limit);
    },
    async leaveReceipt(eventIds, receipt) {
      leaveReceipt(deps, caller(), eventIds, receipt);
    },
    async setWorking(threadId, working) {
      setWorking(deps, connection, caller(), threadId, working);
    },
    async head() {
      caller();
      return head(deps.store);
    },
    async store() {
      caller();
      return deps.store.id;
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
