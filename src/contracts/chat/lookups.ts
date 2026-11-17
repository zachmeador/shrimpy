import { nameKey } from "../gateway/index.ts";
import type { Channel } from "./channel.ts";

/*
 * Finding a member, a room or a DM from what a person or an agent calls it, as
 * every client and the agent's tools find one. A name is found whatever its
 * case. When nothing is found, each caller says so in its own words.
 */

/** The one of `named` called `name`, if there is one. */
function called<T extends { readonly name: string }>(named: readonly T[], name: string): T | undefined {
  const wanted = nameKey(name);
  return named.find((each) => nameKey(each.name) === wanted);
}

/** The member of `members`, the roster, called `name`, if there is one. */
export function findMember<T extends { readonly name: string }>(members: readonly T[], name: string): T | undefined {
  return called(members, name);
}

/** The room among `channels` called `name`, written without its `#`, if there is one. */
export function findRoom(channels: readonly Channel[], name: string): Channel | undefined {
  return called(
    channels.filter((channel) => channel.kind === "room"),
    name,
  );
}

/** The DM among `channels` with the member whose ID is `member`, if there is one yet. */
export function findDm(channels: readonly Channel[], member: string): Channel | undefined {
  return channels.find((channel) => channel.kind === "dm" && channel.members.some((each) => each.id === member));
}
