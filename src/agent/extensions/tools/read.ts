import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-durable";
import { written } from "../../intake/index.ts";
import type { MessageToolsOptions } from "./options.ts";
import { placeOf } from "./place.ts";
import { answer, callSignal, chatFailure, failure } from "./results.ts";
import * as words from "./words.ts";

const DEFAULT_LIMIT = 20;
const MOST = 100;

/**
 * `read_messages`: read the newest messages of a thread, oldest first, each as
 * a message is shown to the model when it arrives. With nothing said about
 * which thread, it is the one the turn came from.
 */
export function readMessages(options: MessageToolsOptions) {
  return defineTool({
    name: "read_messages",
    description: words.READ_DESCRIPTION,
    parameters: Type.Object({
      from: Type.Optional(Type.String({ description: words.READ_FROM })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MOST, description: words.READ_LIMIT })),
      before: Type.Optional(Type.Integer({ minimum: 0, description: words.READ_BEFORE })),
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
          self: options.self,
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

        const text = shown
          .map((message) => written({ author: message.author.name, sentAt: message.sentAt, text: message.text }))
          .join("\n\n");
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
