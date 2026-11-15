/**
 * Following a value that is worked out from things that tell when they change,
 * as Chord's `self.follow` takes one: read at once, read again after a change,
 * and only what changed passed on. It also gives the type of what `self.follow`
 * takes, for code that follows something by hand where Chord isn't imported.
 * It must not know what the value is or where it comes from.
 */
export type { FollowAttach } from "@earendil-works/chord";
export { type Followed, follow } from "./follow.ts";
