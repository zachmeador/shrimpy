/**
 * Telling a person that a command was used wrongly: the error a command
 * raises, and the checks on its arguments that raise it. It must not know any
 * command.
 */
export { expectArguments, parsing, UsageError } from "./usage.ts";
