import type { Context, Draft, MutableReplicatedState } from "@earendil-works/chord";
import type { Message, ThreadView } from "../../contracts/chat/index.ts";

type Fields = Record<string, unknown>;

/**
 * Publish `next` as one revision that touches only what changed. Messages that
 * fell out of the window leave from the front, new ones join at the back, and a
 * message that changed, such as one an agent left a receipt on, is replaced
 * where it stands. A client that is watching gets a few small operations, not a
 * copy of the thread.
 */
export function publishThreadView(
  state: MutableReplicatedState<ThreadView>,
  next: ThreadView,
  context: Context,
): void {
  const before = state.value;
  state.change(context, (draft: Draft<ThreadView>) => {
    patchFields(draft.thread as unknown as Fields, before.thread, next.thread);
    patchMessages(draft.messages, before.messages, next.messages);
    if (before.earlier !== next.earlier) draft.earlier = next.earlier;
  });
}

function patchFields(draft: Fields, before: object, after: object): void {
  const from = before as Fields;
  for (const [key, value] of Object.entries(after)) {
    if (!same(from[key], value)) draft[key] = value;
  }
}

function patchMessages(draft: Draft<Message>[], before: Message[], next: Message[]): void {
  const first = next[0];
  const dropped = first === undefined ? before.length : leadingOlderThan(before, first.seq);
  const kept = before.slice(dropped);
  // Messages only ever join at the back, so what stays must line up with the
  // front of `next`. If it does not, start the list again.
  if (kept.some((message, index) => message.seq !== next[index]?.seq)) {
    draft.splice(0, draft.length, ...next);
    return;
  }
  draft.splice(0, dropped);
  kept.forEach((message, index) => {
    const after = next[index];
    if (after !== undefined && !same(message, after)) draft[index] = after;
  });
  draft.push(...next.slice(kept.length));
}

function leadingOlderThan(messages: Message[], seq: number): number {
  const found = messages.findIndex((message) => message.seq >= seq);
  return found === -1 ? messages.length : found;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
