/**
 * What the gateway accepts as an agent's token: 32 to 200 letters, digits,
 * hyphens and underscores, which is what base64url makes of 24 or more random
 * bytes. A token that is easier to guess would be a weak password.
 */
export function isToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,200}$/.test(value);
}
