import type { Member } from "../../contracts/chat/index.ts";
import type { Store } from "../store/index.ts";

/**
 * Give the members the store has met the names `members`, the roster now, has
 * for them, in one transaction. A channel and a message name their members, so
 * every one a renamed member is in reads the new name from then on. Members the
 * store hasn't met are left for when they first come.
 */
export function renameMembers(store: Store, members: readonly Member[]): void {
  store.transaction((tx) => {
    for (const member of members) {
      const known = tx.member(member.id);
      if (known !== undefined && known.name !== member.name) tx.saveMember(member);
    }
  });
}
