const THREAD_ID = /^th_[0-9a-z]{12}$/;
const BARE_ENTRY = /^e(\d+)$/;
const BARE_MESSAGE = /^m(\d+)$/;
const THREAD_ENTRY = /^(th_[0-9a-z]{12})#e(\d+)$/;
const THREAD_MESSAGE = /^(th_[0-9a-z]{12})#m(\d+)$/;

/** A reference returned by `history({ action: "search" })` and accepted by `history({ action: "read" })`. */
export type HistoryRef =
  | { readonly kind: "entry"; readonly threadId?: string; readonly entryId: number }
  | { readonly kind: "message"; readonly threadId?: string; readonly seq: number };

/** Whether `value` is a bare Shrimpy thread ID (`th_...`). */
export const isThreadId = (value: string): boolean => THREAD_ID.test(value);

/** Parse a `history` ref (`e87`, `th_...#e87`, `m418`, or `th_...#m418`), or undefined if invalid. */
export function parseHistoryRef(raw: string): HistoryRef | undefined {
  const text = raw.trim();
  let match = BARE_ENTRY.exec(text);
  if (match !== null) {
    const entryId = Number(match[1]);
    return Number.isSafeInteger(entryId) && entryId > 0 ? { kind: "entry", entryId } : undefined;
  }
  match = BARE_MESSAGE.exec(text);
  if (match !== null) {
    const seq = Number(match[1]);
    return Number.isSafeInteger(seq) && seq >= 0 ? { kind: "message", seq } : undefined;
  }
  match = THREAD_ENTRY.exec(text);
  if (match !== null) {
    const entryId = Number(match[2]);
    return Number.isSafeInteger(entryId) && entryId > 0 ? { kind: "entry", threadId: match[1]!, entryId } : undefined;
  }
  match = THREAD_MESSAGE.exec(text);
  if (match !== null) {
    const seq = Number(match[2]);
    return Number.isSafeInteger(seq) && seq >= 0 ? { kind: "message", threadId: match[1]!, seq } : undefined;
  }
  return undefined;
}

/** Format a session entry ref: short (`e87`) in the current thread, qualified (`th_...#e87`) elsewhere. */
export const formatEntryRef = (entryId: number, threadId: string, currentThreadId?: string): string =>
  threadId === currentThreadId ? `e${String(entryId)}` : `${threadId}#e${String(entryId)}`;

/** Format a chat message ref (`th_...#m418`). */
export const formatMessageRef = (seq: number, threadId: string): string => `${threadId}#m${String(seq)}`;
