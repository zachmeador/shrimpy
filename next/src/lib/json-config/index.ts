/**
 * Checking config that people edit by hand. Problems are reported against the
 * file and the place in it, so the message says what to fix. It must not know
 * what any file means. This door reads text; `node.ts` reads files.
 */
export { ConfigError, type ConfigObject } from "./config-object.ts";
export { parseConfig } from "./parse.ts";
