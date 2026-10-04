import { randomBytes } from "node:crypto";

/** A new token for an agent that is about to join: 32 random bytes, in base64url. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}
