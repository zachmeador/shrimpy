/**
 * Test support for the console's links: quick pauses and polls so a test does
 * not wait on the real ones, and links started the way a test needs them,
 * stopped when the test ends. Only tests and test fixtures import this, and it
 * must not know how anything is drawn.
 */
import type { TestContext } from "node:test";
import { type Backoff, backoff } from "../../../../lib/retry/index.ts";
import { stopAfter } from "../../../../lib/testing/index.ts";
import { keepRegistry, localTransports, type RegistryLink, type RegistryOptions } from "../index.ts";

/** How often a test's links look again at what they are polling. */
export const POLL_MS = 15;

/** Pauses between attempts that a test does not notice. */
export const quick = (): Backoff => backoff({ firstMs: 1, maxMs: 8, random: () => 0 });

/** A registry link to the gateway on this machine, closed when the test ends. The test needs a runtime directory of its own. */
export function startRegistry(t: TestContext, options: Partial<RegistryOptions> = {}): RegistryLink {
  const registry = keepRegistry({ transports: localTransports(), pollMs: POLL_MS, backoff: quick(), ...options });
  stopAfter(t, () => registry.close());
  return registry;
}
