import type { Member } from "../../contracts/chat/index.ts";
import { identifier } from "../input/index.ts";
import type { ChatDeps } from "./deps.ts";

/**
 * Come in with a ticket: the gateway says whose it is, and the member is
 * recorded as the roster has it now, a new name included. Nobody says who they
 * are, and a ticket works once.
 */
export async function enter(deps: ChatDeps, ticket: unknown): Promise<Member> {
  const member = await deps.identity.redeem(identifier(ticket, "ticket"));
  deps.store.transaction((tx) => tx.saveMember(member));
  return member;
}
