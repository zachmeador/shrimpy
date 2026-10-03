/**
 * Reading config files that people edit by hand. Problems are reported against
 * the file and the place in it, so the message says what to fix. It must not
 * know what any file means.
 */
export { ConfigError, type ConfigObject } from "./config-object.ts";
export { parseConfig, readConfig } from "./file.ts";
