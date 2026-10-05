/**
 * What the task that follows an input and chat ask of each other, in Shrimpy's
 * own types: `Delivery`, which tells an input's source how its turn ended, and
 * `Working`, which says which inputs are being worked on. This door is all of the
 * module that needs no engine, and it must not know one: the task itself, and
 * what takes an input up, are behind `durable.ts`.
 */
export type { Delivery } from "./delivery.ts";
export type { Working } from "./working.ts";
