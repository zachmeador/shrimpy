/**
 * Node says on standard error that SQLite is an experimental feature, once in
 * every process that loads it, on the versions where it is one: 22 does, and 26
 * does not. Every Shrimpy program loads it, so each would open with two lines
 * that a person can do nothing about. This keeps that one warning from being
 * printed and leaves every other warning as it is. It has to run before
 * anything loads SQLite, so the command line imports it first.
 */
const emitWarning = process.emitWarning.bind(process);

process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const [second] = rest;
  const type = typeof second === "string" ? second : (second as { type?: string } | undefined)?.type;
  const text = typeof warning === "string" ? warning : warning.message;
  if (type === "ExperimentalWarning" && text.includes("SQLite")) return;
  (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;
