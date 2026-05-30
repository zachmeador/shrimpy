import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { formatWithOptions } from "node:util";

type ConsoleMethod = (...args: unknown[]) => void;

function appendConsoleLine(
  logPath: string,
  level: "info" | "warn" | "error",
  args: unknown[],
): void {
  const rendered = formatWithOptions(
    {
      colors: false,
      depth: 6,
      compact: 3,
      breakLength: 120,
    },
    ...args,
  );
  appendFileSync(
    logPath,
    `[${new Date().toISOString()}] [${level}] ${rendered}\n`,
    "utf-8",
  );
}

function wrapConsoleMethod(
  logPath: string,
  level: "info" | "warn" | "error",
  original: ConsoleMethod,
): ConsoleMethod {
  return (...args: unknown[]) => {
    appendConsoleLine(logPath, level, args);
    original(...args);
  };
}

export function installGatewayLogFile(logPath: string): () => void {
  mkdirSync(dirname(logPath), { recursive: true });

  const originalLog = console.log.bind(console) as ConsoleMethod;
  const originalInfo = console.info.bind(console) as ConsoleMethod;
  const originalWarn = console.warn.bind(console) as ConsoleMethod;
  const originalError = console.error.bind(console) as ConsoleMethod;

  console.log = wrapConsoleMethod(logPath, "info", originalLog);
  console.info = wrapConsoleMethod(logPath, "info", originalInfo);
  console.warn = wrapConsoleMethod(logPath, "warn", originalWarn);
  console.error = wrapConsoleMethod(logPath, "error", originalError);

  return () => {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  };
}
