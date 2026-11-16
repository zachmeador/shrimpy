import type { ToolExecutionResult } from "@earendil-works/pi-durable";

/** A tool's answer: just these words. */
export const answer = (text: string): ToolExecutionResult => ({ output: [{ type: "text", text }] });

/** A tool's answer when it did not do what was asked: just these words, marked as an error. */
export const failure = (text: string): ToolExecutionResult => ({ isError: true, output: [{ type: "text", text }] });
