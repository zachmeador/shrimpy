import type { Member } from "../../contracts/chat/index.ts";
import { member as checkMember, refuse } from "../input/index.ts";
import type { ChatDeps } from "./deps.ts";

/**
 * Record who a connection says it is. On one machine the chat server takes the
 * caller's word; a gateway will check it once access crosses machines. A member
 * may change its name, but not what kind of member it is.
 */
export function identify(deps: ChatDeps, claimed: unknown): Member {
  const member = checkMember(claimed, "member");
  return deps.store.transaction((tx) => {
    const known = tx.member(member.id);
    if (known !== undefined && known.kind !== member.kind) {
      refuse(`${member.id} is on record with kind ${known.kind}, not ${member.kind}.`);
    }
    tx.saveMember(member);
    return member;
  });
}
