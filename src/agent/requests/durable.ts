/**
 * Per-request capture and reconstruction for an agent's sessions: records the
 * small metadata delta Pi does not persist (`cutoff`, model/settings, hook
 * diffs, home source revisions, and input omissions/budgets) before each model
 * call, and reconstructs the full inspection view on demand from Pi's immutable
 * transcript. Install its extension last so `beforeRequest` captures messages
 * after every earlier hook has transformed them. Capture is best-effort via
 * `harness.commit` so a diagnostic error never blocks a model request, and the
 * read side degrades cleanly to pre-hook reconstruction for unrecorded turns.
 * It must not know about clients, the chat server, the CLI, or `history/`.
 */
import type { Context } from "@earendil-works/chord/context";
import type { Extension, Harness } from "@earendil-works/pi-durable";
import type { RequestPage, SessionRequest } from "../../contracts/agent/index.ts";
import { type CaptureOptions, createRequestExtension } from "./capture.durable.ts";
import { inspectSessionRequest, listSessionRequests } from "./rebuild.durable.ts";

/** Captures model request metadata and reconstructs full request views for `Session`. */
export interface Requests {
  readonly extension: Extension;
  list(address: string, options: { before?: string; limit: number }, ctx: Context): Promise<RequestPage>;
  inspect(address: string, options: { id?: string; entry?: number }, ctx: Context): Promise<SessionRequest | null>;
}

export type { CaptureOptions };

export function createRequests(harness: Harness, options: CaptureOptions): Requests {
  return {
    extension: createRequestExtension(harness, options),
    list: (address, query, ctx) => listSessionRequests(harness, address, query, ctx),
    inspect: (address, query, ctx) => inspectSessionRequest(harness, address, query, ctx),
  };
}
