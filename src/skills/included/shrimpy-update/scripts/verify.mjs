import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEARTBEAT_MAX_AGE_MS = 15_000;

export async function verifyUpdate(options) {
  if (!options?.expectedTag) throw new Error("--expected-tag is required");
  if (!options?.expectedCommit) throw new Error("--expected-commit is required");
  if (!new Set(["running", "stopped"]).has(options.gateway)) {
    throw new Error("--gateway must be running or stopped");
  }

  const command = options.shrimpy ?? "shrimpy";
  const workspace = resolve(options.workspace ?? process.env.SHRIMPY_WORKSPACE ?? process.cwd());
  const env = { ...process.env, SHRIMPY_WORKSPACE: workspace };
  const timeoutMs = boundedInteger(options.timeoutMs ?? 45_000, 1_000, 300_000, "--timeout-ms");
  const intervalMs = boundedInteger(options.intervalMs ?? 1_000, 100, 10_000, "--interval-ms");
  const failures = [];
  const checks = {};

  const versionRun = run(command, ["--version"], { env });
  const actualVersion = parseShrimpyVersion(versionRun.stdout);
  const expectedVersion = options.expectedTag.replace(/^v/, "");
  checks.version = {
    ok: versionRun.ok && actualVersion === expectedVersion,
    expected: expectedVersion,
    actual: actualVersion ?? null,
    output: stripAnsi(versionRun.stdout).trim() || null,
  };
  if (!checks.version.ok) failures.push(`expected Shrimpy ${expectedVersion}, found ${actualVersion ?? "unknown"}`);

  const gatewayStatusRun = run(command, ["gateway", "status"], { env });
  const statusFields = parseLabelledOutput(gatewayStatusRun.stdout);
  const appRoot = resolve(
    options.appRoot
      ?? statusFields["app checkout"]
      ?? findAppRoot(resolveExecutable(command))
      ?? process.cwd(),
  );
  const commitRun = git(appRoot, ["rev-parse", "HEAD"]);
  const actualCommit = commitRun.stdout.trim();
  checks.commit = {
    ok: commitRun.ok && actualCommit === options.expectedCommit,
    expected: options.expectedCommit,
    actual: actualCommit || null,
    appRoot,
  };
  if (!checks.commit.ok) failures.push(`expected commit ${options.expectedCommit}, found ${actualCommit || "unknown"}`);

  const dirtyRun = git(appRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ".",
  ]);
  const dirtyPaths = dirtyRun.stdout.split(/\r?\n/).filter(Boolean);
  checks.cleanCheckout = {
    ok: dirtyRun.ok && dirtyPaths.length === 0,
    dirtyPaths: dirtyPaths.slice(0, 40),
    dirtyPathCount: dirtyPaths.length,
  };
  if (!checks.cleanCheckout.ok) failures.push(`application checkout is not clean (${dirtyPaths.length} changed paths)`);

  const agentsRun = run(command, ["agent", "list", "--json"], { env });
  const agents = parseJson(agentsRun.stdout);
  checks.agents = {
    ok: agentsRun.ok && Array.isArray(agents),
    count: Array.isArray(agents) ? agents.length : 0,
    ids: Array.isArray(agents) ? agents.map((agent) => agent.id) : [],
  };
  if (!checks.agents.ok) failures.push("unable to list configured agents");

  const skillChecks = [];
  const contextChecks = [];
  for (const agent of Array.isArray(agents) ? agents : []) {
    const skillRun = run(command, ["skills", "validate", "--agent", agent.id, "--json"], { env });
    const skillResult = parseJson(skillRun.stdout);
    const errors = (skillResult?.issues ?? []).filter((issue) => issue.level === "error");
    const warnings = (skillResult?.issues ?? []).filter((issue) => issue.level === "warning");
    const skillOk = skillRun.ok && Boolean(skillResult) && errors.length === 0;
    skillChecks.push({
      agentId: agent.id,
      ok: skillOk,
      errors: errors.map(summarizeIssue),
      warnings: warnings.map(summarizeIssue),
    });
    if (!skillOk) failures.push(`skill validation failed for agent ${agent.id}`);

    const contextRun = run(command, ["context", "--agent", agent.id, "--sections", "--json"], { env });
    const context = parseJson(contextRun.stdout);
    const sectionCount = Array.isArray(context?.promptSections) ? context.promptSections.length : 0;
    const contextOk = contextRun.ok
      && context?.target?.agentId === agent.id
      && sectionCount > 0;
    contextChecks.push({
      agentId: agent.id,
      ok: contextOk,
      sectionCount,
      error: contextOk ? null : contextRun.stderr.trim() || "context output was incomplete",
    });
    if (!contextOk) failures.push(`context assembly failed for agent ${agent.id}`);
  }
  checks.skills = {
    ok: skillChecks.every((check) => check.ok),
    agents: skillChecks,
  };
  checks.context = {
    ok: contextChecks.every((check) => check.ok),
    agents: contextChecks,
  };

  if (options.gateway === "running") {
    const gatewayResult = await waitForGateway({
      workspace,
      appRoot,
      timeoutMs,
      intervalMs,
      heartbeatMaxAgeMs: HEARTBEAT_MAX_AGE_MS,
    });
    checks.gateway = gatewayResult;
    if (!gatewayResult.ok) failures.push(`gateway did not become healthy: ${gatewayResult.reason}`);
  } else {
    const pid = readPid(join(workspace, "runtime", "pids", "gateway.pid"));
    const alive = pid !== null && processAlive(pid);
    checks.gateway = {
      ok: !alive,
      expected: "stopped",
      pid,
      alive,
    };
    if (alive) failures.push(`gateway should be stopped but PID ${pid} is alive`);
  }

  const ok = failures.length === 0;
  let gatewayLogTail;
  if (!ok) {
    const logPathRun = run(command, ["gateway", "logs", "--path"], { env });
    const logPath = logPathRun.stdout.trim()
      || join(workspace, "runtime", "logs", "gateway.log");
    gatewayLogTail = {
      path: logPath,
      lines: tailFile(logPath, options.logLines ?? 80),
    };
  }

  return {
    ok,
    generatedAt: new Date().toISOString(),
    workspace,
    expected: {
      tag: options.expectedTag,
      commit: options.expectedCommit,
      gateway: options.gateway,
    },
    checks,
    failures,
    ...(gatewayLogTail ? { gatewayLogTail } : {}),
  };
}

export async function waitForGateway(options) {
  const healthPath = join(options.workspace, "runtime", "gateway-health.json");
  const deadline = Date.now() + options.timeoutMs;
  let last = { ok: false, reason: "gateway health has not been reported" };
  let attempts = 0;
  while (Date.now() <= deadline) {
    attempts += 1;
    const health = readJson(healthPath);
    last = await evaluateGatewayHealth(health, options);
    if (last.ok) {
      return {
        ...last,
        expected: "running",
        attempts,
        waitedMs: Math.max(0, options.timeoutMs - (deadline - Date.now())),
      };
    }
    if (Date.now() + options.intervalMs > deadline) break;
    await delay(options.intervalMs);
  }
  return {
    ...last,
    ok: false,
    expected: "running",
    attempts,
    waitedMs: options.timeoutMs,
  };
}

export async function evaluateGatewayHealth(health, options) {
  if (!health || health.version !== 1) {
    return { ok: false, reason: "gateway health file is missing or invalid" };
  }
  if (!Number.isInteger(health.pid) || !processAlive(health.pid)) {
    return { ok: false, reason: `gateway PID ${health.pid ?? "unknown"} is not alive`, health };
  }
  if (health.workspace !== options.workspace) {
    return { ok: false, reason: `gateway is bound to workspace ${health.workspace}`, health };
  }
  if (resolve(health.appCheckout) !== resolve(options.appRoot)) {
    return { ok: false, reason: `gateway is bound to app checkout ${health.appCheckout}`, health };
  }
  const heartbeatAgeMs = Date.now() - health.heartbeatAt;
  if (!Number.isFinite(heartbeatAgeMs) || heartbeatAgeMs > options.heartbeatMaxAgeMs) {
    return { ok: false, reason: `gateway heartbeat is stale (${heartbeatAgeMs}ms old)`, health };
  }
  const unhealthySurfaces = Object.entries(health.surfaces ?? {})
    .filter(([, surface]) => surface?.status !== "healthy")
    .map(([name, surface]) => ({ name, status: surface?.status ?? "unknown", error: surface?.lastError ?? null }));
  if (unhealthySurfaces.length > 0) {
    return { ok: false, reason: "one or more surfaces are not healthy", unhealthySurfaces, health };
  }
  if (health.web?.enabled) {
    if (health.web.status !== "running") {
      return { ok: false, reason: `web inspector is ${health.web.status}`, health };
    }
    const probe = await probeUrl(health.web.url);
    if (!probe.ok) {
      return { ok: false, reason: `web inspector probe failed: ${probe.error}`, webProbe: probe, health };
    }
    return {
      ok: true,
      reason: null,
      pid: health.pid,
      heartbeatAgeMs,
      surfaces: health.surfaces ?? {},
      web: health.web,
      webProbe: probe,
    };
  }
  return {
    ok: true,
    reason: null,
    pid: health.pid,
    heartbeatAgeMs,
    surfaces: health.surfaces ?? {},
    web: health.web ?? { enabled: false },
  };
}

async function probeUrl(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeIssue(issue) {
  return {
    skillId: issue.skillId ?? null,
    message: issue.message ?? String(issue),
    path: issue.path ?? null,
  };
}

function parseShrimpyVersion(output) {
  return /\bshrimpy\s+v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/i.exec(stripAnsi(output))?.[1];
}

function parseLabelledOutput(text) {
  const fields = {};
  for (const rawLine of stripAnsi(text).split(/\r?\n/)) {
    const match = /^([^:]+):\s*(.*)$/.exec(rawLine.trim());
    if (match) fields[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return fields;
}

function parseJson(text) {
  if (!text?.trim()) return undefined;
  try {
    return JSON.parse(stripAnsi(text));
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(stripAnsi(text.slice(start, end + 1)));
    } catch {
      return undefined;
    }
  }
}

function readJson(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function readPid(path) {
  if (!existsSync(path)) return null;
  const value = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function tailFile(path, lineCount) {
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, "utf8").replace(/\n$/, "").split(/\r?\n/);
    return lines.slice(-boundedInteger(lineCount, 1, 500, "--log-lines"));
  } catch (error) {
    return [`unable to read gateway log: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function git(cwd, args) {
  return run("git", ["-C", cwd, ...args]);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeout,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: !result.error && result.status === 0,
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function resolveExecutable(command) {
  const candidate = command.includes("/")
    ? command
    : run("which", [command]).stdout.trim();
  if (!candidate) return undefined;
  try {
    return realpathSync(candidate);
  } catch {
    return resolve(candidate);
  }
}

function findAppRoot(commandPath) {
  if (!commandPath) return undefined;
  let cursor = dirname(commandPath);
  for (let index = 0; index < 5; index += 1) {
    const packagePath = join(cursor, "package.json");
    if (existsSync(packagePath)) {
      try {
        if (JSON.parse(readFileSync(packagePath, "utf8")).name === "shrimpy") return cursor;
      } catch {
        // Keep walking.
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return undefined;
}

function boundedInteger(value, minimum, maximum, flag) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function parseArgs(argv) {
  const options = {};
  const valueFlags = new Map([
    ["--workspace", "workspace"],
    ["--app-root", "appRoot"],
    ["--shrimpy", "shrimpy"],
    ["--expected-tag", "expectedTag"],
    ["--expected-commit", "expectedCommit"],
    ["--gateway", "gateway"],
    ["--timeout-ms", "timeoutMs"],
    ["--interval-ms", "intervalMs"],
    ["--log-lines", "logLines"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    const key = valueFlags.get(flag);
    if (!key) throw new Error(`unknown argument: ${flag}`);
    const value = argv[++index];
    if (!value) throw new Error(`missing value for ${flag}`);
    options[key] = value;
  }
  return options;
}

function usage() {
  return [
    "Usage: node verify.mjs --expected-tag <tag> --expected-commit <sha> --gateway <running|stopped> [options]",
    "",
    "Options:",
    "  --workspace <path>",
    "  --app-root <path>",
    "  --shrimpy <command>",
    "  --timeout-ms <milliseconds>  default: 45000",
    "  --interval-ms <milliseconds> default: 1000",
    "  --log-lines <count>          default: 80",
  ].join("\n");
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else {
      const result = await verifyUpdate(options);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
