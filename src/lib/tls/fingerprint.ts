/**
 * Whether `text` is written as `fingerprintOf` writes a key's fingerprint: 16
 * bytes in base64url, which is 22 letters, digits, hyphens and underscores.
 */
export function isFingerprint(text: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(text);
}
