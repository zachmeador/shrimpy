import { int, obj, opt, str } from "@earendil-works/pi-schema";
import { defineTool } from "@earendil-works/pi-durable";
import { type Message, namer } from "../../contracts/chat/index.ts";
import { answer, failure } from "../host/durable.ts";
import { standing } from "../inputs/index.ts";
import { callSignal, type ChatCalls, chatFailure } from "../links/index.ts";
import type { MessageToolsOptions } from "./options.ts";
import { placeOf } from "./place.durable.ts";
import * as words from "./words.ts";

const DEFAULT_LIMIT = 20;
const MOST = 100;

/**
 * `read_messages`: read the newest messages of a thread, oldest first, each as
 * it now stands: edited, deleted or reacted to as it may be. With nothing said
 * about which thread, it is the one the turn came from; `from` names one of a
 * DM's threads, or a room the agent is in or one of its threads.
 */
export function readMessages(options: MessageToolsOptions) {
  return defineTool({
    name: "read_messages",
    description: words.READ_DESCRIPTION,
    parameters: obj({
      from: opt(str({ description: words.READ_FROM })),
      limit: opt(int({ minimum: 1, maximum: MOST, description: words.READ_LIMIT })),
      before: opt(int({ minimum: 0, description: words.READ_BEFORE })),
    }),
    // Reading changes nothing, so a read that was cut short by a restart is simply done again.
    replay: "safe",
    // When there is too much to show, the newest messages are the ones to keep.
    outputLimits: { retain: "tail" },
    async execute({ from, limit, before }, api, context) {
      const live = options.chat();
      if (live === undefined) return failure(words.READ_UNREACHABLE);

      const count = limit ?? DEFAULT_LIMIT;
      const signal = callSignal(live, context);
      try {
        const place = await placeOf({
          argument: "from",
          value: from,
          conversationId: api.conversationId,
          read: api,
          chat: live.chat,
          self: live.self,
          roster: options.roster(),
          context,
          signal,
        });
        if ("problem" in place) return failure(place.problem);

        // One more than asked for shows whether there is anything older.
        const found = await live.chat.read(place.threadId, before ?? null, count + 1, signal);
        const older = found.length > count;
        const shown = older ? found.slice(found.length - count) : found;
        const oldest = shown[0];
        if (oldest === undefined) return answer(words.nothingToRead(place.label, before !== undefined));

        const nameOf = reactorNames(live.chat, shown);
        const text = shown.map((message) => standing(message, nameOf)).join("\n\n");
        const lines = [words.readHeader(place.label), "", text];
        if (older) lines.push("", words.olderMessages(oldest.seq, from));
        return answer(lines.join("\n"));
      } catch (error) {
        const why = chatFailure(error, live, context);
        return failure("refused" in why ? words.readRefused(why.refused) : words.READ_UNREACHABLE);
      }
    },
  });
}

/**
 * What the members who reacted are called. Reactions name members by ID, and
 * the channel knows their names, so it is asked only when there is a reaction.
 */
function reactorNames(chat: ChatCalls, messages: Message[]): (memberId: string) => string {
  const first = messages[0];
  const reacted = messages.some((message) => message.reactions.length > 0);
  const channel = first === undefined || !reacted ? undefined : chat.channels().find((each) => each.id === first.channelId);
  return namer(channel?.members ?? []);
}
