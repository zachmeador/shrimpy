import type { Context, Draft, MutableReplicatedState } from "@earendil-works/chord";
import type { SessionView } from "../../contracts/agent/index.ts";

type Fields = Record<string, unknown>;

/**
 * Publish `next` as one revision that touches only what changed. Text that
 * grew is appended to, so a streaming answer travels as small appends instead
 * of a full copy on every update.
 */
export function publishSessionView(
  state: MutableReplicatedState<SessionView>,
  next: SessionView,
  context: Context,
): void {
  const before = state.value;
  if (same(before, next)) return;
  state.change(context, (draft: Draft<SessionView>) => {
    const shared = Math.min(before.items.length, next.items.length);
    for (let index = 0; index < shared; index++) {
      const from = before.items[index];
      const to = next.items[index];
      if (from === undefined || to === undefined) continue;
      if (from.type === to.type) patchFields(draft.items[index] as Fields, from, to);
      else draft.items[index] = to;
    }
    if (next.items.length > shared) draft.items.push(...next.items.slice(shared));
    else if (before.items.length > shared) draft.items.splice(shared);
    patchFields(draft.status as unknown as Fields, before.status, next.status);
    if (before.entries !== next.entries) draft.entries = next.entries;
  });
}

function patchFields(draft: Fields, before: object, after: object): void {
  const from = before as Fields;
  for (const [key, to] of Object.entries(after)) {
    const was = from[key];
    if (typeof was === "string" && typeof to === "string" && grew(was, to)) {
      draft[key] = (draft[key] as string) + to.slice(was.length);
    } else if (!same(was, to)) {
      draft[key] = to;
    }
  }
}

function grew(before: string, after: string): boolean {
  return after.length > before.length && after.startsWith(before);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
