import { ConfigError, ConfigObject } from "./config-object.ts";

/** Parse `text` as the JSON object that `file` holds. */
export function parseConfig(text: string, file: string): ConfigObject {
  let value: unknown;
  try {
    // JSON.parse rejects a leading byte-order mark, which some editors add.
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new ConfigError(`${file}: not valid JSON (${describe(error)}).`, { cause: error });
  }
  return new ConfigObject(value, file);
}

export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
