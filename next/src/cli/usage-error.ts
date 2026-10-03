/** The command was used wrongly. The CLI prints the message with the command's usage and exits with 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** Run `parse`, which calls `util.parseArgs`, and report its complaints as usage errors. */
export function parsing<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (error instanceof TypeError && typeof code === "string" && code.startsWith("ERR_PARSE_ARGS")) {
      throw new UsageError(error.message);
    }
    throw error;
  }
}

/** The positional arguments, which must be exactly the ones `names` lists. */
export function expectArguments(positionals: string[], names: [string]): [string];
export function expectArguments(positionals: string[], names: [string, string]): [string, string];
export function expectArguments(positionals: string[], names: string[]): string[] {
  const missing = names[positionals.length];
  if (missing !== undefined) throw new UsageError(`Missing ${missing}.`);
  const extra = positionals[names.length];
  if (extra !== undefined) throw new UsageError(`Unexpected argument: ${extra}. Put text with spaces in quotes.`);
  return positionals;
}
