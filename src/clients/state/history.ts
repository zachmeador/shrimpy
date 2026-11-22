import { MAX_READ, type SessionItem, type SessionPage } from "../../contracts/agent/index.ts";
import { valueOf } from "../../contracts/gateway/index.ts";
import type { SessionCalls } from "../network/index.ts";
import type { Holdings } from "./holdings.ts";
import { type Open, wholeSession } from "./model.ts";

/** The most items of a session shown at once, which are its newest: a watch reads back from where the window starts to as many. */
const SHOWN_ITEMS = 200;

/**
 * Read the session on show whole back from where its window starts, page after
 * page, until as many items are shown as a watch shows or the session's start
 * is reached, when its window has moved since the last read. `changed` is told
 * when what was read is in.
 */
export function readBack(held: Holdings, open: Open, changed: () => void): void {
  const whole = wholeSession(open);
  const watched = whole === undefined ? undefined : held.sessions().get(whole.agent);
  const shown = watched?.held.shown();
  if (watched === undefined || watched.address !== whole?.address || shown === undefined || shown.refusal !== null) return;
  const from = shown.window.before;
  if (from === null || watched.older?.from === from || watched.reading === from) return;
  watched.reading = from;
  readPages(watched.held.calls, from, SHOWN_ITEMS - shown.window.items.length).then(
    (read) => {
      if (held.sessions().get(watched.agent) !== watched || watched.reading !== from) return;
      watched.reading = undefined;
      watched.older = { from, ...read };
      changed();
    },
    () => {
      // A read that failed is tried again when the window moves, or the session is shown again. The window alone stands.
      if (held.sessions().get(watched.agent) === watched && watched.reading === from) watched.reading = undefined;
    },
  );
}

/** The items of the entries from `from` back, until there are `wanted` of them or the session's start is reached. */
async function readPages(calls: SessionCalls, from: number, wanted: number): Promise<{ items: SessionItem[]; before: number | null }> {
  let items: SessionItem[] = [];
  let before: number | null = from;
  while (before !== null && items.length < wanted) {
    const page: SessionPage = valueOf(await calls.read(before, MAX_READ));
    items = [...page.items, ...items];
    before = page.before;
  }
  return { items, before };
}
