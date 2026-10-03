import type { ReplicatedState } from "@earendil-works/chord";

/** What a replicated state holds, or an error naming `what` if the server's first copy has not come yet. */
export function received<T>(state: ReplicatedState<T>, what: string): T {
  const value = state.value;
  if (value === undefined) throw new Error(`The ${what} has not arrived yet`);
  return value;
}
