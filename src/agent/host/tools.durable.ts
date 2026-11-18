import type { ToolExecutionApi, ToolExecutionResult } from "@earendil-works/pi-durable";

/** A tool's answer: just these words. */
export const answer = (text: string): ToolExecutionResult => ({ output: [{ type: "text", text }] });

/** A tool's answer when it did not do what was asked: just these words, marked as an error. */
export const failure = (text: string): ToolExecutionResult => ({ isError: true, output: [{ type: "text", text }] });

/**
 * What names a request that the tool call in `api` makes of another program,
 * which carries out a request of one ID once, so that a call that runs again
 * does nothing twice: the tool's `kind`, and the `part` when one call makes
 * several. The call's own ID is the model's and may repeat in another session,
 * so the engine's number for the call goes with it, and the engine numbers its
 * tasks again in a new database, so what the agent's records are called goes
 * with both.
 */
export function toolRequestId(kind: string, recordsId: string, api: ToolExecutionApi, part?: number): string {
  const call = api.callId.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 80);
  const id = `${kind}-${recordsId}-${String(api.taskId)}-${call}`;
  return part === undefined ? id : `${id}-${String(part)}`;
}
