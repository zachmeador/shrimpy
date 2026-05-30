#!/usr/bin/env node
import { spawn } from "node:child_process";

const host = process.env.SHRIMPY_WEB_DEV_HOST ?? "0.0.0.0";
const apiPort = process.env.SHRIMPY_WEB_API_PORT ?? "5174";
const webPort = process.env.SHRIMPY_WEB_DEV_PORT ?? "5175";

function runOnce(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal });
    });
  });
}

function start(command, args) {
  return spawn(command, args, {
    stdio: "inherit",
    env: process.env,
  });
}

const build = await runOnce("tsc", []);
if (build.code !== 0) {
  process.exit(build.code);
}

const children = [
  start("node", [
    "dist/web/server.js",
    "--api-only",
    `--host=${host}`,
    `--port=${apiPort}`,
  ]),
  start("vite", [
    "--config",
    "web/vite.config.ts",
    "--host",
    host,
    "--port",
    webPort,
  ]),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 250).unref();
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(
      `web:dev child exited (${signal ?? `code ${code ?? 1}`}); stopping dev servers`,
    );
    shutdown(code ?? 1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
