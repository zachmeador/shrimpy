/**
 * What the task that closes a question when its time is up asks of whoever can
 * look at chat, in Shrimpy's own types: `Look`. This door is all of the module that
 * needs no engine, and it must not know one: the tool that asks, the task that
 * waits, and what closes a question are behind `durable.ts`.
 */
export type { Look, Looked } from "./look.ts";
