/** A problem in a config file. The message names the file and the place in it. */
export class ConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigError";
  }
}

/**
 * One JSON object in a file, read field by field. Every field that is read
 * counts as known, and `done()` rejects any key that was never read, so a typo
 * or an unsupported key is an error instead of being ignored.
 */
export class ConfigObject {
  readonly #file: string;
  readonly #path: string;
  readonly #value: Record<string, unknown>;
  readonly #known = new Set<string>();

  constructor(value: unknown, file: string, path = "") {
    if (!isObject(value)) {
      throw new ConfigError(`${file}: ${path === "" ? "the file" : path} must be a JSON object.`);
    }
    this.#file = file;
    this.#path = path;
    this.#value = value;
  }

  string(key: string): string {
    const value = this.#take(key);
    if (value === undefined) throw this.#problem(key, "is required");
    if (typeof value !== "string" || value === "") throw this.#problem(key, "must be a non-empty string");
    return value;
  }

  optionalString(key: string): string | undefined {
    this.#known.add(key);
    return this.#has(key) ? this.string(key) : undefined;
  }

  optionalBoolean(key: string): boolean | undefined {
    const value = this.#take(key);
    if (value !== undefined && typeof value !== "boolean") throw this.#problem(key, "must be true or false");
    return value;
  }

  number(key: string): number {
    const value = this.#take(key);
    if (value === undefined) throw this.#problem(key, "is required");
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw this.#problem(key, "must be a number that is zero or more");
    }
    return value;
  }

  optionalPositiveInteger(key: string): number | undefined {
    const value = this.#take(key);
    if (value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)) {
      throw this.#problem(key, "must be a whole number above zero");
    }
    return value;
  }

  /** A string that must be one of `choices`. */
  choice<T extends string>(key: string, choices: readonly T[]): T {
    const value = this.string(key);
    if (!choices.includes(value as T)) {
      throw this.#problem(key, `must be ${list(choices)}, not "${value}"`);
    }
    return value as T;
  }

  /** An array of strings that must each be one of `choices`. */
  optionalChoices<T extends string>(key: string, choices: readonly T[]): T[] | undefined {
    const items = this.#take(key);
    if (items === undefined) return undefined;
    if (!Array.isArray(items)) throw this.#problem(key, "must be an array");
    return items.map((item: unknown, index) => {
      if (typeof item !== "string" || !choices.includes(item as T)) {
        throw this.#problem(`${key}[${index}]`, `must be ${list(choices)}`);
      }
      return item as T;
    });
  }

  object(key: string): ConfigObject {
    const value = this.#take(key);
    if (value === undefined) throw this.#problem(key, "is required");
    return this.#child(value, key);
  }

  optionalObject(key: string): ConfigObject | undefined {
    const value = this.#take(key);
    return value === undefined ? undefined : this.#child(value, key);
  }

  /** The objects in an array. */
  objects(key: string): ConfigObject[] {
    const items = this.#take(key);
    if (items === undefined) throw this.#problem(key, "is required");
    if (!Array.isArray(items)) throw this.#problem(key, "must be an array");
    return items.map((item: unknown, index) => this.#child(item, `${key}[${index}]`));
  }

  /** An object whose keys are chosen by the file: each key with its object. */
  entries(): [string, ConfigObject][] {
    return Object.entries(this.#value).map(([key, value]) => {
      this.#known.add(key);
      return [key, this.#child(value, key)];
    });
  }

  /** An object whose contents this file does not check, such as options for another library. */
  optionalFreeform(key: string): Record<string, unknown> | undefined {
    const value = this.#take(key);
    if (value === undefined) return undefined;
    if (!isObject(value)) throw this.#problem(key, "must be a JSON object");
    return value;
  }

  /** An object with string values and keys chosen by the file. */
  optionalStrings(key: string): Record<string, string> | undefined {
    const value = this.optionalFreeform(key);
    if (value === undefined) return undefined;
    for (const [name, entry] of Object.entries(value)) {
      if (typeof entry !== "string") throw this.#problem(`${key}.${name}`, "must be a string");
    }
    return value as Record<string, string>;
  }

  /** Everything not read yet, for objects that carry extra keys on purpose. */
  rest(): Record<string, unknown> {
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.#value)) {
      if (!this.#known.has(key)) rest[key] = value;
      this.#known.add(key);
    }
    return rest;
  }

  /** Reject keys that were never read. Call it after every field has been. */
  done(): void {
    const unknown = Object.keys(this.#value).filter((key) => !this.#known.has(key));
    if (unknown.length === 0) return;
    const where = this.#path === "" ? "the file" : this.#path;
    throw new ConfigError(
      `${this.#file}: ${where} has unsupported keys: ${unknown.join(", ")}. Supported keys: ${[...this.#known].join(", ")}.`,
    );
  }

  /** A problem with a value that the caller checks, such as a pattern. */
  problem(key: string, message: string): ConfigError {
    return this.#problem(key, message);
  }

  #has(key: string): boolean {
    return Object.hasOwn(this.#value, key);
  }

  #take(key: string): unknown {
    this.#known.add(key);
    return this.#has(key) ? this.#value[key] : undefined;
  }

  #child(value: unknown, key: string): ConfigObject {
    return new ConfigObject(value, this.#file, this.#at(key));
  }

  #at(key: string): string {
    return this.#path === "" ? key : `${this.#path}.${key}`;
  }

  #problem(key: string, message: string): ConfigError {
    return new ConfigError(`${this.#file}: ${this.#at(key)} ${message}.`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(choices: readonly string[]): string {
  return choices.map((choice) => `"${choice}"`).join(" or ");
}
