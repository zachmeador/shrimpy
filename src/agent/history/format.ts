import { type Channel, type Message, roomLabel, type SearchHit } from "../../contracts/chat/index.ts";
import { snippetAround } from "../../lib/text/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { formatEntryRef, formatMessageRef } from "./refs.ts";

/** Fields needed to render one session search hit (plain, engine-free). */
export interface SessionHitSummary {
  readonly threadId: string;
  readonly label: string;
  readonly entryId: number;
  readonly at: number | undefined;
  readonly kind: string;
  readonly preCompaction: boolean;
  readonly snippet: string;
}

/** Format one session search hit with its copy-pasteable `ref`. */
export function formatSessionHit(hit: SessionHitSummary, currentThreadId: string | undefined): string {
  const ref = formatEntryRef(hit.entryId, hit.threadId, currentThreadId);
  const when = hit.at === undefined ? "" : ` ${localTime(hit.at)}`;
  const pre = hit.preCompaction ? " [pre-compaction]" : "";
  const where = hit.threadId === currentThreadId ? "" : ` · ${hit.label}`;
  return `- [${ref}]${when}${where} · ${hit.kind}${pre}: ${hit.snippet}`;
}

/** Format one chat search hit with its copy-pasteable `ref` and place label. */
export function formatChatHit(
  hit: SearchHit,
  channels: readonly Channel[],
  selfId: string,
  currentThreadId: string | undefined,
  terms: readonly string[],
): string {
  const { message, threadName } = hit;
  const ref = formatMessageRef(message.seq, message.threadId);
  const when = localTime(message.sentAt);
  const where = chatPlaceLabel(message, threadName, channels, selfId, currentThreadId);
  const snippet = snippetAround(message.text, terms);
  return `- [${ref}] ${when} · ${where} · @${message.author.name}: ${snippet}`;
}

function chatPlaceLabel(
  message: Message,
  threadName: string | null,
  channels: readonly Channel[],
  selfId: string,
  currentThreadId: string | undefined,
): string {
  if (message.threadId === currentThreadId) return "this thread";
  const channel = channels.find((ch) => ch.id === message.channelId);
  const named = threadName === null ? "" : ` / ${threadName}`;
  if (channel === undefined) return `${message.threadId}${named}`;
  if (channel.kind === "room") return `${roomLabel(channel.name)}${named} (${message.threadId})`;
  const isSelfIn = channel.members.some((m) => m.id === selfId);
  if (isSelfIn) return `DM with @${channel.name}${named} (${message.threadId})`;
  return `DM (${channel.name})${named} (${message.threadId})`;
}
