import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RELEVANT_PATHS = [
  "package.json",
  "package-lock.json",
  "src/app",
  "src/commands",
  "src/config",
  "src/gateway",
  "src/setup",
  "src/skills",
  "src/surfaces",
  "src/update",
  "src/web",
  "src/workspace",
  "web",
  "docs/reference",
  "test",
];

export async function buildInventory(options = {}) {
  const command = options.shrimpy ?? "shrimpy";
  const workspace = resolve(
    options.workspace
      ?? process.env.SHRIMPY_WORKSPACE
      ?? process.cwd(),
  );
  const env = workspaceEnv(workspace);

  const gatewayRun = run(command, ["gateway", "status"], { env });
  const gatewayFields = parseLabelledOutput(gatewayRun.stdout);
  const commandPath = resolveExecutable(command);
  const appRoot = resolve(
    options.appRoot
      ?? gatewayFields["app checkout"]
      ?? findAppRoot(commandPath)
      ?? process.cwd(),
  );
  const packageJson = readJson(join(appRoot, "package.json"));
  const metadata = readJson(join(dirname(appRoot), ".shrimpy-install.json"));
  const managed = Boolean(
    metadata?.managed === true && resolve(metadata.installDir) === appRoot,
  );

  const head = git(appRoot, ["rev-parse", "HEAD"]).stdout.trim() || undefined;
  const branch = git(appRoot, ["branch", "--show-current"]).stdout.trim() || undefined;
  const exactTag = git(appRoot, ["describe", "--tags", "--exact-match", "HEAD"]).stdout.trim() || undefined;
  const dirtyPaths = git(appRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ".",
  ]).stdout.split(/\r?\n/).filter(Boolean);

  const origin = metadata?.origin
    ?? git(appRoot, ["remote", "get-url", "origin"]).stdout.trim()
    ?? undefined;
  const remoteReleases = origin ? releasesFromRemote(origin) : [];
  const localReleases = releasesFromLocal(appRoot);
  const releases = remoteReleases.length > 0 ? remoteReleases : localReleases;
  const latest = releases[0];

  const currentRef = options.currentRef
    ?? metadata?.installedRef
    ?? exactTag
    ?? branch;
  const targetRef = options.targetRef
    ?? latest?.tag;
  let targetCommit = options.targetCommit
    ?? latest?.commit;
  if (!targetCommit && targetRef) {
    targetCommit = git(appRoot, ["rev-parse", `${targetRef}^{commit}`]).stdout.trim() || undefined;
  }

  const targetObjectAvailable = Boolean(
    targetCommit
      && git(appRoot, ["cat-file", "-e", `${targetCommit}^{commit}`]).ok,
  );
  const fastForward = fastForwardEligibility(appRoot, head, targetCommit, targetObjectAvailable);
  const diff = relevantDiff(appRoot, head, targetCommit, targetObjectAvailable);
  const changedIncludedSkillIds = changedIncludedSkills(diff.files);

  const agentRun = run(command, ["agent", "list", "--json"], { env });
  const agents = parseJson(agentRun.stdout) ?? [];
  const skillCopies = collectSkillCopies(command, env, agents);
  const changedSkills = changedIncludedSkillIds.map((id) => ({
    id,
    installedCopies: skillCopies
      .filter((copy) => copy.id === id)
      .map(({ agentId, scope, installedPath, modified, source }) => ({
        agentId,
        scope,
        installedPath,
        modified,
        source,
      })),
  }));

  const targetPackage = targetObjectAvailable && targetCommit
    ? parseJson(git(appRoot, ["show", `${targetCommit}:package.json`]).stdout)
    : undefined;
  const requiredNode = targetPackage?.engines?.node ?? packageJson?.engines?.node;
  const npmRun = run("npm", ["--version"]);
  const compatibility = {
    node: {
      current: process.version,
      required: requiredNode ?? null,
      compatible: requiredNode ? satisfiesMinimumNode(process.versions.node, requiredNode) : null,
    },
    npm: {
      current: npmRun.ok ? npmRun.stdout.trim() : null,
      available: npmRun.ok,
    },
  };

  const portCandidates = await inspectPortCandidates(appRoot, head, targetCommit, targetObjectAvailable);
  const logPathRun = run(command, ["gateway", "logs", "--path"], { env });
  const checkpointRun = run(command, ["workspace", "track", "status", "--json"], { env });
  const gateway = summarizeGateway(gatewayFields, logPathRun.stdout.trim());
  const updateAvailable = Boolean(
    targetCommit && head && targetCommit !== head,
  );
  const verifyScript = join(dirname(fileURLToPath(import.meta.url)), "verify.mjs");
  const gatewayIntent = gateway.process === "running" ? "running" : "stopped";
  const proposedCommands = buildCommands({
    appRoot,
    managed,
    currentRef,
    targetRef,
    targetCommit,
    gateway,
    gatewayRelevant: diff.files.some((file) =>
      file.path.startsWith("src/gateway/service/")
      || file.path === "src/app/environment.ts"
      || file.path === "src/workspace/paths.ts"
    ),
    verifyScript,
    gatewayIntent,
  });

  const warnings = [];
  if (!gatewayRun.ok) warnings.push(commandFailure("gateway status", gatewayRun));
  if (!agentRun.ok) warnings.push(commandFailure("agent inventory", agentRun));
  if (!checkpointRun.ok) warnings.push(commandFailure("workspace checkpoint status", checkpointRun));
  if (!targetObjectAvailable && targetCommit) {
    warnings.push("target commit is not present in the local object database; fast-forward and diff details are unknown without a fetch");
  }

  return {
    generatedAt: new Date().toISOString(),
    workspace,
    install: {
      type: managed ? "managed" : head ? "source-checkout" : "unmanaged",
      appRoot,
      command: commandPath ?? command,
      version: packageJson?.version ?? null,
      currentRef: currentRef ?? null,
      currentCommit: head ?? metadata?.installedCommit ?? null,
      dirty: dirtyPaths.length > 0,
      dirtyPaths: dirtyPaths.slice(0, 40),
      dirtyPathCount: dirtyPaths.length,
      origin: origin || null,
    },
    releases: {
      current: {
        tag: exactTag ?? (typeof currentRef === "string" && currentRef.startsWith("v") ? currentRef : null),
        commit: head ?? null,
      },
      latest: latest ?? null,
      target: targetRef || targetCommit ? {
        ref: targetRef ?? null,
        commit: targetCommit ?? null,
        objectAvailable: targetObjectAvailable,
      } : null,
      updateAvailable,
      fastForward,
    },
    compatibility,
    gateway,
    checkpoint: parseJson(checkpointRun.stdout) ?? {
      available: false,
      error: checkpointRun.stderr.trim() || null,
    },
    diff,
    includedSkills: changedSkills,
    portCandidates,
    proposedCommands,
    warnings,
  };
}

function buildCommands(input) {
  const commands = [];
  if (input.gateway.process === "running") commands.push("shrimpy gateway stop");
  if (input.managed && input.targetRef && input.targetCommit) {
    commands.push(
      `shrimpy update apply --tag ${shellQuote(input.targetRef)} --commit ${shellQuote(input.targetCommit)}`,
    );
  } else if (!input.managed) {
    commands.push(`git -C ${shellQuote(input.appRoot)} fetch --tags --prune origin`);
    if (input.targetRef) {
      commands.push(`git -C ${shellQuote(input.appRoot)} merge --ff-only ${shellQuote(input.targetRef)}`);
    }
    commands.push(`env -u SHRIMPY_WORKSPACE npm --prefix ${shellQuote(input.appRoot)} test`);
  }
  if (input.gatewayRelevant && input.gateway.manager !== "manual") {
    commands.push("shrimpy gateway install");
  }
  if (input.gatewayIntent === "running") commands.push("shrimpy gateway start");
  if (input.targetRef && input.targetCommit) {
    commands.push(
      `node ${shellQuote(input.verifyScript)} --expected-tag ${shellQuote(input.targetRef)} --expected-commit ${shellQuote(input.targetCommit)} --gateway ${input.gatewayIntent}`,
    );
  }
  return commands;
}

function collectSkillCopies(command, env, agents) {
  const copies = new Map();
  for (const agent of Array.isArray(agents) ? agents : []) {
    if (!agent?.id) continue;
    const result = run(command, ["skills", "list", "--agent", agent.id, "--json"], { env });
    const inventory = parseJson(result.stdout);
    for (const skill of inventory?.skills ?? []) {
      const info = skill.packageInfo;
      if (!info || info.sourceKind !== "included") continue;
      const key = info.installKey ?? `${info.scope}:${info.agentId ?? ""}:${info.id}`;
      if (copies.has(key)) continue;
      copies.set(key, {
        id: info.id ?? skill.id,
        agentId: info.scope === "agent" ? info.agentId ?? agent.id : null,
        scope: info.scope ?? skill.scope,
        installedPath: info.installedPath ?? info.rootPath ?? null,
        modified: Boolean(info.modified),
        source: info.source ?? null,
      });
    }
  }
  return [...copies.values()];
}

function relevantDiff(appRoot, currentCommit, targetCommit, targetObjectAvailable) {
  if (!currentCommit || !targetCommit || !targetObjectAvailable) {
    return {
      available: false,
      files: [],
      fileCount: 0,
      truncated: false,
      categories: {},
    };
  }
  const result = git(appRoot, [
    "diff",
    "--name-status",
    `${currentCommit}..${targetCommit}`,
    "--",
    ...RELEVANT_PATHS,
  ]);
  const allFiles = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [status = "", first = "", second] = line.split("\t");
    return {
      status,
      path: second ?? first,
      ...(second ? { previousPath: first } : {}),
    };
  });
  const categories = {};
  for (const file of allFiles) {
    const category = diffCategory(file.path);
    categories[category] = (categories[category] ?? 0) + 1;
  }
  return {
    available: result.ok,
    files: allFiles.slice(0, 120),
    fileCount: allFiles.length,
    truncated: allFiles.length > 120,
    categories,
  };
}

function changedIncludedSkills(files) {
  const ids = new Set();
  for (const file of files) {
    for (const path of [file.path, file.previousPath]) {
      const match = path?.match(/^src\/skills\/included\/([^/]+)\//);
      if (match) ids.add(match[1]);
    }
  }
  return [...ids].sort();
}

async function inspectPortCandidates(appRoot, currentCommit, targetCommit, targetObjectAvailable) {
  if (!currentCommit || !targetCommit || !targetObjectAvailable) return [];
  const output = git(appRoot, [
    "diff",
    "--unified=0",
    `${currentCommit}..${targetCommit}`,
    "--",
    "src/config",
    "src/gateway",
    "src/surfaces",
    "src/web",
    "web",
  ]).stdout;
  let file = "";
  const candidates = new Map();
  for (const line of output.split(/\r?\n/)) {
    const header = /^\+\+\+ b\/(.+)$/.exec(line);
    if (header) {
      file = header[1];
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const portMatch = /\bport\s*[:=]\s*(\d{2,5})\b/i.exec(line);
    if (!portMatch) continue;
    const port = Number.parseInt(portMatch[1], 10);
    if (port < 1 || port > 65535) continue;
    candidates.set(port, { port, source: file });
  }
  return Promise.all([...candidates.values()].map(async (candidate) => ({
    ...candidate,
    availableOnLoopback: await portAvailable(candidate.port),
  })));
}

function summarizeGateway(fields, logPath) {
  const webValue = fields["web inspector"] ?? "unknown";
  const webUrl = /https?:\/\/\S+/.exec(webValue)?.[0] ?? null;
  const surfaces = Object.entries(fields)
    .filter(([key]) => key.startsWith("surface "))
    .map(([key, value]) => ({
      name: key.slice("surface ".length),
      status: value.split(/\s+/, 1)[0],
      detail: value,
    }));
  return {
    manager: fields["gateway manager"] ?? "unknown",
    serviceId: fields["gateway service id"] ?? null,
    serviceState: fields["gateway service"] ?? "unknown",
    enabled: fields["gateway enabled"] ?? "unknown",
    process: firstWord(fields["gateway process"] ?? fields.gateway ?? "unknown"),
    processDetail: fields["gateway process"] ?? fields.gateway ?? "unknown",
    heartbeat: firstWord(fields["gateway heartbeat"] ?? "unknown"),
    workspaceBinding: fields.workspace ?? null,
    appBinding: fields["app checkout"] ?? null,
    web: {
      status: firstWord(webValue),
      url: webUrl,
      detail: webValue,
    },
    surfaces,
    logPath: logPath || fields["gateway log"] || null,
    serviceLogPath: fields["gateway service log"] ?? null,
    warnings: Object.entries(fields)
      .filter(([key]) => key === "gateway warning" || key === "runtime warning")
      .map(([, value]) => value),
  };
}

function fastForwardEligibility(appRoot, currentCommit, targetCommit, targetObjectAvailable) {
  if (!currentCommit || !targetCommit) return { eligible: null, reason: "current or target commit is unknown" };
  if (!targetObjectAvailable) return { eligible: null, reason: "target commit is not available locally" };
  const result = git(appRoot, ["merge-base", "--is-ancestor", currentCommit, targetCommit]);
  if (result.code === 0) return { eligible: true, reason: null };
  if (result.code === 1) return { eligible: false, reason: "current commit is not an ancestor of target" };
  return { eligible: null, reason: result.stderr.trim() || "git ancestry check failed" };
}

function releasesFromRemote(origin) {
  const result = run("git", ["ls-remote", "--tags", origin, "v*"], { timeout: 10_000 });
  if (!result.ok) return [];
  const commits = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    const [commit, ref] = line.trim().split(/\s+/, 2);
    if (!commit || !ref?.startsWith("refs/tags/")) continue;
    const raw = ref.slice("refs/tags/".length);
    const peeled = raw.endsWith("^{}");
    const tag = peeled ? raw.slice(0, -3) : raw;
    if (!parseSemver(tag)) continue;
    if (peeled || !commits.has(tag)) commits.set(tag, commit);
  }
  return sortReleases([...commits].map(([tag, commit]) => ({ tag, commit })));
}

function releasesFromLocal(appRoot) {
  const result = git(appRoot, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/tags/v*",
  ]);
  return sortReleases(result.stdout.split(/\r?\n/).flatMap((line) => {
    const tag = line.trim();
    const commit = tag
      ? git(appRoot, ["rev-parse", `${tag}^{commit}`]).stdout.trim()
      : "";
    return tag && commit && parseSemver(tag) ? [{ tag, commit }] : [];
  }));
}

function sortReleases(releases) {
  return releases.sort((left, right) => compareSemver(right.tag, left.tag));
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] - b.numbers[index];
  }
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  return a.prerelease.join(".").localeCompare(b.prerelease.join("."), undefined, { numeric: true });
}

function parseSemver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value ?? "");
  if (!match) return undefined;
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

function satisfiesMinimumNode(current, range) {
  const required = />=\s*(\d+)\.(\d+)\.(\d+)/.exec(range);
  if (!required) return null;
  const actual = current.split(".").map(Number);
  const minimum = required.slice(1).map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

function diffCategory(path) {
  if (path.startsWith("src/skills/included/")) return "included-skills";
  if (path.startsWith("src/gateway/") || path.startsWith("src/surfaces/") || path.startsWith("src/web/") || path.startsWith("web/")) return "gateway-and-surfaces";
  if (path.startsWith("src/config/") || path.startsWith("src/setup/") || path.startsWith("src/workspace/")) return "workspace-and-config";
  if (path.startsWith("docs/reference/")) return "reference-docs";
  if (path.startsWith("test/")) return "tests";
  return "application";
}

function parseLabelledOutput(text) {
  const fields = {};
  for (const rawLine of stripAnsi(text).split(/\r?\n/)) {
    const match = /^([^:]+):\s*(.*)$/.exec(rawLine.trim());
    if (!match) continue;
    fields[match[1].trim().toLowerCase()] = match[2].trim();
  }
  return fields;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function firstWord(value) {
  return value.trim().split(/\s+/, 1)[0] || "unknown";
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

function workspaceEnv(workspace) {
  return workspace ? { ...process.env, SHRIMPY_WORKSPACE: workspace } : process.env;
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
    const metadata = readJson(join(cursor, "package.json"));
    if (metadata?.name === "shrimpy") return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return undefined;
}

function commandFailure(label, result) {
  return `${label} failed${result.code === null ? "" : ` (exit ${result.code})`}: ${result.stderr.trim() || "no error output"}`;
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text)
    ? text
    : `'${text.replaceAll("'", `'"'"'`)}'`;
}

function portAvailable(port) {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolvePromise(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(() => resolvePromise(true));
    });
  });
}

function parseArgs(argv) {
  const options = {};
  const valueFlags = new Map([
    ["--workspace", "workspace"],
    ["--app-root", "appRoot"],
    ["--shrimpy", "shrimpy"],
    ["--current-ref", "currentRef"],
    ["--target-ref", "targetRef"],
    ["--target-commit", "targetCommit"],
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
    "Usage: node inventory.mjs [options]",
    "",
    "Options:",
    "  --workspace <path>",
    "  --app-root <path>",
    "  --shrimpy <command>",
    "  --current-ref <ref>",
    "  --target-ref <ref>",
    "  --target-commit <sha>",
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
      console.log(JSON.stringify(await buildInventory(options), null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
