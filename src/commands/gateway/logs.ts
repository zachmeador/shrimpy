import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  unwatchFile,
  watchFile,
} from "node:fs";
import { createAppRuntime } from "../../app/runtime.js";
import { parsePositiveInt } from "../../util/parse.js";
import { renderCommandUsage } from "../catalog.js";
import {
  parseCommandArgs,
  printError,
} from "../framework.js";

const USAGE = renderCommandUsage(["gateway", "logs"]);

export function printGatewayLogs(
  config: Parameters<typeof createAppRuntime>[0],
  argv: string[],
): Promise<number> | number {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      lines: { type: "string", short: "n" },
      tail: { type: "string" },
      follow: { type: "boolean", short: "f", default: false },
      path: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage: USAGE,
  });

  const runtime = createAppRuntime(config);
  const logPath = runtime.paths.gatewayLogPath;
  if (values.path) {
    console.log(logPath);
    return 0;
  }

  if (!existsSync(logPath)) {
    return printError(`gateway log not found: ${logPath}`);
  }

  const lineCount = parsePositiveInt(values.lines ?? values.tail, "--lines") ?? 80;
  const content = readFileSync(logPath, "utf-8");
  const recent = tailLines(content, lineCount);
  if (recent) console.log(recent);

  if (!values.follow) return 0;

  let offset = statSync(logPath).size;
  watchFile(logPath, { interval: 500 }, (current) => {
    if (current.size < offset) offset = 0;
    if (current.size <= offset) return;

    const stream = createReadStream(logPath, {
      start: offset,
      end: current.size - 1,
      encoding: "utf-8",
    });
    offset = current.size;
    stream.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
  });

  return new Promise((resolve) => {
    const stop = () => {
      process.off("SIGINT", stop);
      unwatchFile(logPath);
      resolve(0);
    };
    process.on("SIGINT", stop);
  });
}

function tailLines(text: string, lineCount: number): string {
  const lines = text.endsWith("\n")
    ? text.slice(0, -1).split("\n")
    : text.split("\n");
  return lines.slice(-lineCount).join("\n");
}
