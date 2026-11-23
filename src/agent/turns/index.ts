/**
 * What the task that follows an input and chat ask of each other, in Shrimpy's
 * own types: `Delivery`, which tells an input's source how its turn ended, with
 * `chatPause` for how long a task sleeps between tries at chat, and `Working`,
 * which says which inputs are being worked on. This door is all of the module
 * that needs no engine, and it must not know one: the task itself, and what takes
 * an input up, are behind `durable.ts`.
 */
export { chatPause, type Delivery, type Told } from "./delivery.ts";
export type { Working } from "./working.ts";
