import { readFileSync } from "node:fs";
import { ConfigError, ConfigObject } from "./config-object.ts";

/** Parse `text` as the JSON object that `file` holds. */
export function parseConfig(text: string, file: string): ConfigObject {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    throw new ConfigError(`${file}: not valid JSON (${describe(error)}).`, { cause: error });
  }
  return new ConfigObject(value, file);
}

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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
