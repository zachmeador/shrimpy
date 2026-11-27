import { defineTool } from "@earendil-works/pi-durable";
import { bool, int, obj, oneOf, opt, str } from "@earendil-works/pi-schema";
import { type Thread } from "../../contracts/chat/index.ts";
import { filesOfMessages } from "../chat/index.ts";
import { answer, failure } from "../host/durable.ts";
import { standing } from "../inputs/index.ts";
import { callSignal, chatFailure } from "../links/index.ts";
import type { Watches } from "../watches/durable.ts";
import type { ChatToolsOptions } from "./options.ts";
import { reactorNames, resolveChannel, resolveThread } from "./place.durable.ts";
import * as words from "./words.ts";

const DEFAULT_READ_LIMIT = 20;
const MAX_READ_LIMIT = 100;

const THREAD_DESCRIPTION =
  "List, read, create, rename, or archive chat threads. " +
  "Use list with `to` (@name or #room), read with `thread` (th_..., @name/<thread>, #room, or omitted for this thread), " +
  "create with `to` + optional `name`, rename with `thread` + `name`, and archive with `thread` (archiving a watched agent DM thread also drops the open watch on it).";

export function threadTool(options: ChatToolsOptions, watches: Watches) {
  return defineTool({
    name: "thread",
    description: THREAD_DESCRIPTION,
    parameters: obj({
      action: oneOf(["list", "read", "create", "rename", "archive"] as const, {
        description: "What to do: list, read, create, rename, or archive a thread.",
      }),
      to: opt(str({ description: 'Channel for list or create: "@name" or "#room" (defaults to current channel).' })),
      thread: opt(str({ description: 'Target thread for read, rename, or archive: "th_...", "@name/<thread>", "#room", "#room/<thread>" (defaults to current thread).' })),
      name: opt(str({ description: "Thread name for create (optional) or rename (required)." })),
      archived: opt(bool({ description: "For action: archive — true to archive (default), false to unarchive." })),
      limit: opt(int({ minimum: 1, maximum: MAX_READ_LIMIT, description: "How many messages to read (default 20, max 100)." })),
      before: opt(int({ minimum: 0, description: "Read messages older than this sequence number." })),
    }),
    outputLimits: { retain: "tail" },
    async execute({ action, to, thread, name, archived, limit, before }, api, context) {
      const live = options.chat();
      if (live === undefined) return failure(words.UNREACHABLE);
      const signal = callSignal(live, context);

      try {
        switch (action) {
          case "list": {
            const target = await resolveChannel({
              value: to,
              openDmIfMissing: false,
              includeReadOnly: true,
              conversationId: api.conversationId,
              read: api,
              chat: live.chat,
              self: live.self,
              roster: options.roster(),
              context,
              signal,
            });
            if ("problem" in target) return failure(target.problem);
            const all = await live.chat.threads(target.channel.id, signal);
            if (all.length === 0) return answer(`No threads in ${target.label}.`);
            const active = all.filter((t) => !t.archived);
            const arch = all.filter((t) => t.archived);
            const lines = [`Threads in ${target.label}:`];
            if (active.length > 0) lines.push(words.threadBullets(active));
            else lines.push("(no active threads)");
            if (arch.length > 0) lines.push("", `Archived (${arch.length}):`, words.threadBullets(arch));
            return answer(lines.join("\n"));
          }

          case "read": {
            const place = await resolveThread({
              argument: "thread",
              value: thread ?? to,
              allowNewDm: false,
              includeReadOnly: true,
              conversationId: api.conversationId,
              read: api,
              chat: live.chat,
              self: live.self,
              roster: options.roster(),
              context,
              signal,
            });
            if ("problem" in place) return failure(place.problem);
            const count = limit ?? DEFAULT_READ_LIMIT;
            const found = await live.chat.read(place.threadId, before ?? null, count + 1, signal);
            const older = found.length > count;
            const shown = older ? found.slice(found.length - count) : found;
            const oldest = shown[0];
            if (oldest === undefined) {
              return answer(before === undefined ? `No messages in ${place.label}.` : `No earlier messages in ${place.label}.`);
            }
            const nameOf = reactorNames(live.chat, shown);
            const files = await filesOfMessages({ chat: live.chat, files: options.files, signal }, shown);
            const body = shown.map((message, index) => standing(message, nameOf, files[index])).join("\n\n");
            const lines = [`Messages in ${place.label} (${place.threadId}), oldest first:`, "", body];
            if (older) {
              lines.push("", `There are older messages. Call thread({ action: "read", thread: "${place.threadId}", before: ${oldest.seq} }) to read further back.`);
            }
            return answer(lines.join("\n"));
          }

          case "create": {
            const target = await resolveChannel({
              value: to,
              openDmIfMissing: true,
              conversationId: api.conversationId,
              read: api,
              chat: live.chat,
              self: live.self,
              roster: options.roster(),
              context,
              signal,
            });
            if ("problem" in target) return failure(target.problem);
            const title = name?.trim() === "" ? null : (name?.trim() ?? null);
            const existing = await api.memo<Thread>("created", context);
            const made = existing ?? (await api.memo("created", await live.chat.createThread(target.channel.id, title, signal), context));
            const named = made.name === null ? "" : ` ("${made.name}")`;
            return answer(`Created thread ${made.id}${named} in ${target.label}.`);
          }

          case "rename": {
            const trimmed = name?.trim() ?? "";
            if (trimmed === "") return failure("Give a non-empty name to rename the thread.");
            const place = await resolveThread({
              argument: "thread",
              value: thread,
              allowNewDm: false,
              conversationId: api.conversationId,
              read: api,
              chat: live.chat,
              self: live.self,
              roster: options.roster(),
              context,
              signal,
            });
            if ("problem" in place) return failure(place.problem);
            const updated = await live.chat.rename(place.threadId, trimmed, place.revision, signal);
            return answer(`Renamed thread ${updated.id} to "${updated.name ?? trimmed}".`);
          }

          case "archive": {
            const wantArchived = archived ?? true;
            const place = await resolveThread({
              argument: "thread",
              value: thread,
              allowNewDm: false,
              conversationId: api.conversationId,
              read: api,
              chat: live.chat,
              self: live.self,
              roster: options.roster(),
              context,
              signal,
            });
            if ("problem" in place) return failure(place.problem);
            const updated = await live.chat.archive(place.threadId, wantArchived, place.revision, signal);
            if (wantArchived) await watches.dropForThread(place.threadId);
            return answer(`${wantArchived ? "Archived" : "Unarchived"} thread ${updated.id}.`);
          }
        }
      } catch (error) {
        const why = chatFailure(error, live, context);
        return failure("refused" in why ? `Chat refused the request: ${why.refused}` : words.UNREACHABLE);
      }
    },
  });
}
