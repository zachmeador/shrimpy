import { nameKey } from "../gateway/index.ts";
import type { Channel } from "./channel.ts";

/*
 * Finding a member, a room or a DM from what a person or an agent calls it, as
 * every client and the agent's tools find one, and what a member is called by
 * its ID. A name is found whatever its case. When nothing is found, each caller
 * says so in its own words.
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

/**
 * What `members` are called, by the IDs that threads, reactions and receipts
 * carry: each one's name, the last one given for an ID given twice, and the ID
 * itself for an ID none of them has.
 */
export function namer(members: readonly { readonly id: string; readonly name: string }[]): (memberId: string) => string {
  const names = new Map(members.map((member) => [member.id, member.name]));
  return (memberId) => names.get(memberId) ?? memberId;
}
