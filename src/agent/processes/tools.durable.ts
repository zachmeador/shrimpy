import { bool, int, obj, oneOf, opt, str } from "@earendil-works/pi-schema";
import { defineExtension, defineTool, type Extension } from "@earendil-works/pi-durable";
import { oneLine } from "../../lib/plain/index.ts";
import { howLong } from "../../lib/time/index.ts";
import { answer, failure } from "../host/durable.ts";
import { CAN_END_TURN } from "../inputs/index.ts";
import type { ProcessRuntime } from "./manager.durable.ts";

const BASH_DESCRIPTION =
  "Run a shell command from your home directory. By default waits up to 60 seconds and returns combined stdout and stderr; " +
  "if still running after 60 seconds it moves to the background and returns its process ID so you can end your turn. " +
  "Pass background: true for long-running commands (downloads, builds, coding agents) to start immediately in the background. " +
  "Only a command started with background: true takes input through process; any other gets none, so a command that reads input ends at once. " +
  "Background commands wake this thread when they exit (and once after 15 minutes if still running).";

const PROCESS_DESCRIPTION =
  "Inspect or control background bash commands: list running commands, read recent output, send input to one started with background: true (eof: true closes its input), or kill a running command.";

/** `bash` and `process` tools installed as one extension. */
export function processTools(runtime: ProcessRuntime): Extension {
  const bash = defineTool({
    name: "bash",
    description: BASH_DESCRIPTION,
    parameters: obj({
      command: str({ description: "Shell command to execute in your home directory." }),
      background: opt(bool({ description: "Run immediately in the background and wake this thread when it exits. Only these commands take input through process." })),
    }),
    outputLimits: { retain: "tail" },
    async execute({ command, background }, api, context) {
      if (command.trim() === "") return failure("Command is empty.");
      const result = await runtime.run(command, background === true, api, context);
      if (result.kind === "backgrounded") {
        const lines = [
          result.auto
            ? `Command is still running after 60s and moved to the background as ${result.id}.`
            : `Started in the background as ${result.id}.`,
          `Full log: ${result.logPath}`,
        ];
        if (result.output.trim() !== "") {
          lines.push("", "Output so far:", result.output.trimEnd());
        }
        lines.push("", `Use process({ action: "read", id: "${result.id}" }) to check output or process({ action: "kill", id: "${result.id}" }) to stop it. This thread will wake when it exits. ${CAN_END_TURN}`);
        return answer(lines.join("\n"));
      }

      const diagnostics =
        result.logPath === undefined
          ? []
          : [{ severity: "info" as const, code: "full_output", message: `Full output: ${result.logPath}` }];
      if (result.exitCode === 0) {
        return {
          output: [{ type: "text", text: result.output }],
          ...(diagnostics.length === 0 ? {} : { diagnostics }),
        };
      }
      return {
        output: [{ type: "text", text: result.output }],
        isError: true,
        diagnostics: [
          ...diagnostics,
          { severity: "error", code: "exit_code", message: `Command exited with code ${result.exitCode}` },
        ],
      };
    },
  });

  const proc = defineTool({
    name: "process",
    description: PROCESS_DESCRIPTION,
    parameters: obj({
      action: oneOf(["list", "read", "input", "kill"] as const, {
        description: "What to do: list running commands, read output tail, write to stdin, or kill a running command.",
      }),
      id: opt(str({ description: "Process ID (proc_...), required for read, input, and kill." })),
      lines: opt(int({ minimum: 1, maximum: 2000, description: "How many recent lines to read (default 100)." })),
      text: opt(str({ description: "Text to write to stdin (for action: input). Include a trailing newline when submitting a line." })),
      eof: opt(bool({ description: "For action: input, close stdin after writing text, so a command reading until the end of its input can finish." })),
    }),
    async execute({ action, id, lines, text, eof }) {
      switch (action) {
        case "list": {
          const running = await runtime.list();
          if (running.length === 0) return answer("No background commands are running.");
          const now = Date.now();
          const rows = running.map(
            (each) => `${each.id} · ${howLong(Math.max(0, now - each.startedAt))} · thread ${each.threadId} · ${oneLine(each.command)}`,
          );
          return answer(rows.join("\n"));
        }
        case "read": {
          if (id === undefined || id.trim() === "") return failure("Give id (proc_...) to read a process's output.");
          const found = await runtime.read(id.trim(), lines);
          if (found === undefined) return failure(`No process found with ID ${id.trim()}.`);
          const body = found.output === "" ? "(no output yet)" : found.output.trimEnd();
          const note = found.truncated ? "\n(showing recent output tail)" : "";
          return answer(`${body}${note}`);
        }
        case "input": {
          if (id === undefined || id.trim() === "") return failure("Give id (proc_...) to write to a process's stdin.");
          if (text === undefined && eof !== true) return failure("Give text to write to the process's stdin, or eof: true to close it.");
          const closing = eof === true;
          const wrote = await runtime.input(id.trim(), { ...(text === undefined ? {} : { text }), eof: closing });
          if ("problem" in wrote) return failure(wrote.problem);
          if (!closing) return answer(`Sent input to ${id.trim()}.`);
          return answer(text === undefined ? `Closed the input of ${id.trim()}.` : `Sent input to ${id.trim()} and closed its input.`);
        }
        case "kill": {
          if (id === undefined || id.trim() === "") return failure("Give id (proc_...) to kill a running process.");
          const killed = await runtime.killFromTool(id.trim());
          if ("problem" in killed) return failure(killed.problem);
          const tail = killed.output.trim() === "" ? "" : `\n\nLast output:\n${killed.output.trimEnd()}`;
          return answer(`Killed ${id.trim()}.${tail}`);
        }
      }
    },
  });

  return defineExtension({ name: "processes", tools: [bash, proc] });
}
