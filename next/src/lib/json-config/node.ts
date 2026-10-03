/**
 * The Node-only door of the config reader: reading a config file from disk.
 * Browser code must not import this file.
 */
import { readFileSync } from "node:fs";
import { ConfigError, type ConfigObject } from "./config-object.ts";
import { describe, parseConfig } from "./parse.ts";

/** Read `file` as a JSON object, or return undefined when there is no such file. */
export function readConfig(file: string): ConfigObject | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new ConfigError(`${file}: can't be read (${describe(error)}).`, { cause: error });
  }
  return parseConfig(text, file);
}
