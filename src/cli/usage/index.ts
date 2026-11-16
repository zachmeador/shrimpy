/**
 * Telling a person that a command was used wrongly: the error a command
 * raises, the checks on its arguments that raise it, and a check of what it was
 * given whose refusal is one. It must not know any command.
 */
export { checking, expectArguments, parsing, UsageError } from "./usage.ts";
