/**
 * The import rules of the source layout, as one ESLint rule. See
 * docs/REDESIGN/design/code-layout.md.
 */
import { isBuiltin } from "node:module";
import { posix } from "node:path";

const PROGRAMS = ["agent", "chat", "gateway", "clients/console", "clients/web", "cli"];
const FRONT_DOORS = ["index.ts", "node.ts", "durable.ts"];
/** The agent's modules in tiers. A module imports only from the tiers before its own, so imports point one way. */
const AGENT_TIERS = [
  ["inputs", "home", "access"],
  ["links", "host", "records"],
  ["turns"],
  ["questions"],
  ["wakeups", "triggers", "chat"],
  ["sessions", "message-tools", "context"],
];
const tierOf = (module) => AGENT_TIERS.findIndex((tier) => tier.includes(module));

const messages = {
  outside: "Import only from inside src/, not {{target}}.",
  frontDoor: "Import {{module}}/ through its front door, not {{target}}.",
  parent:
    "This file sits inside {{module}}/ and can't reach its files, such as {{target}}: give what both need a directory of its own, with a front door.",
  program:
    "{{from}}/ must not import {{target}}: programs share only contracts/ and lib/.",
  shared: "{{from}}/ may import only {{allowed}}, not {{target}}.",
  provider:
    "A chat provider may import only chat/providers/index.ts and lib/, not {{target}}.",
  testing: "Only tests and test support import a testing/ module, not {{target}}.",
  durable: "Only agent/ imports Pi's durable runtime.",
  durableInAgent:
    "Inside agent/, only a file named *.durable.ts, or a durable.ts door, imports Pi's durable runtime: name this file so, or move what needs the engine into one that is, and let the rest see only Shrimpy's own types.",
  plain:
    "This plain file can't import {{target}}, which needs Pi's durable runtime: name this file *.durable.ts too, or give what both need a plain file.",
  piAi: "Only agent/ imports pi-ai, apart from tests and test support: the rest sees only Shrimpy's own types.",
  tier:
    "agent/{{from}}/ can't import agent/{{target}}/, which is not in a tier before its own: put what both need in a module before them both, or let the top of agent/ hand it in.",
  noTier: "agent/{{from}}/ has no tier: add it to AGENT_TIERS in lint/boundaries.js, after every module it imports.",
  piTui: "Only clients/console/ imports pi-tui, and only from the package root.",
  piTuiDraw:
    "Inside clients/console/, only draw/ imports pi-tui: the client's state and everything that reaches the network must work without a terminal.",
  drawing:
    "Only the top of clients/console/ imports draw/: what the client shows and does must not depend on how it is drawn.",
  browser: "Browser-safe code must not import {{target}}: what needs Node sits behind a node.ts door.",
};

const CONSOLE = "clients/console/";
const CONSOLE_DRAW = `${CONSOLE}draw/`;
/** A file in a directory of the console, as opposed to one at its top. */
const inConsoleDirectory = (path) => path.startsWith(CONSOLE) && path.includes("/", CONSOLE.length);

/** The program or shared area a path under src/ belongs to. */
function ownerOf(path) {
  const parts = path.split("/");
  if (parts[0] === "clients" && parts.length > 2) return `clients/${parts[1]}`;
  return parts[0];
}

const isTest = (path) => path.endsWith(".test.ts");
const isTestSupport = (path) => path.split("/").includes("testing");
/** A Node door, or a file behind one: the files that say they need Node. */
const needsNode = (path) => /(^|\/)node\.ts$|\.node\.ts$/.test(path);
/** A durable door, or a file behind one: the files that say they need Pi's durable runtime. */
const needsDurable = (path) => /(^|\/)durable\.ts$|\.durable\.ts$/.test(path);
/** A file inside a module of the agent, which is a directory of agent/, as opposed to one at the agent's top. */
const inAgentModule = (path) => path.startsWith("agent/") && path.includes("/", "agent/".length);

/**
 * Code that must also run in a browser: the web client, and the contracts and
 * lib/ modules apart from the files that say they need Node. In lib/ that makes
 * a module's index.ts door and everything behind it browser-safe. Tests and
 * test support are never shipped, so they may use Node anywhere.
 */
function isBrowserSafe(path) {
  if (isTest(path) || isTestSupport(path)) return false;
  if (path.startsWith("clients/web/")) return true;
  return (path.startsWith("contracts/") || path.startsWith("lib/")) && !needsNode(path);
}

const reachesNode = (specifier) => isBuiltin(specifier) || /^node:|\/unix$|\/node$/.test(specifier);

function checkPackage(from, specifier) {
  const owner = ownerOf(from);
  if (/^@earendil-works\/pi-durable(\/|$)/.test(specifier)) {
    if (owner !== "agent") return { messageId: "durable" };
    if (!isTest(from) && !isTestSupport(from) && !needsDurable(from)) return { messageId: "durableInAgent" };
  }
  if (/^@earendil-works\/pi-ai(\/|$)/.test(specifier) && owner !== "agent" && !isTest(from) && !isTestSupport(from)) {
    return { messageId: "piAi" };
  }
  if (/^@earendil-works\/pi-tui(\/|$)/.test(specifier)) {
    if (owner !== "clients/console" || specifier !== "@earendil-works/pi-tui") {
      return { messageId: "piTui" };
    }
    if (!from.startsWith(CONSOLE_DRAW)) return { messageId: "piTuiDraw" };
  }
  if (isBrowserSafe(from) && reachesNode(specifier)) {
    return { messageId: "browser", data: { target: specifier } };
  }
  return undefined;
}

function checkRelative(from, specifier) {
  const target = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (target.startsWith("..")) return { messageId: "outside", data: { target: specifier } };

  // A file reaches the files of its own directory, and the front door of any other.
  const targetDir = posix.dirname(target);
  const fromDir = posix.dirname(from);
  if (fromDir !== targetDir && !FRONT_DOORS.includes(posix.basename(target))) {
    const below = fromDir.startsWith(`${targetDir}/`);
    return { messageId: below ? "parent" : "frontDoor", data: { module: targetDir, target } };
  }

  const owner = ownerOf(from);
  const targetOwner = ownerOf(target);
  if (isTestSupport(target) && !isTest(from) && !isTestSupport(from)) {
    return { messageId: "testing", data: { target } };
  }
  if (isBrowserSafe(from) && needsNode(target)) {
    return { messageId: "browser", data: { target } };
  }
  // Inside a module of the agent, plain code can't reach what needs the engine. The top of the agent wires modules together.
  if (inAgentModule(from) && !isTest(from) && !isTestSupport(from) && needsDurable(target) && !needsDurable(from)) {
    return { messageId: "plain", data: { target } };
  }
  // Between the agent's modules, imports point one way. The top of the agent wires them, and tests reach where they need.
  if (inAgentModule(from) && inAgentModule(target) && !isTest(from) && !isTestSupport(from) && !isTestSupport(target)) {
    const [fromModule, targetModule] = [from.split("/")[1], target.split("/")[1]];
    if (fromModule !== targetModule) {
      if (tierOf(fromModule) === -1) return { messageId: "noTier", data: { from: fromModule } };
      if (tierOf(targetModule) >= tierOf(fromModule)) {
        return { messageId: "tier", data: { from: fromModule, target: targetModule } };
      }
    }
  }
  if (target.startsWith(CONSOLE_DRAW) && inConsoleDirectory(from) && !from.startsWith(CONSOLE_DRAW)) {
    return { messageId: "drawing" };
  }

  const provider = /^chat\/providers\/([^/]+)\//.exec(from);
  if (provider) {
    const own = target.startsWith(`chat/providers/${provider[1]}/`);
    if (!own && target !== "chat/providers/index.ts" && targetOwner !== "lib") {
      return { messageId: "provider", data: { target } };
    }
    return undefined;
  }

  if (owner === targetOwner) return undefined;
  if (owner === "lib") {
    return { messageId: "shared", data: { from: owner, allowed: "lib/", target } };
  }
  if (owner === "contracts") {
    if (targetOwner === "lib") return undefined;
    return {
      messageId: "shared",
      data: { from: owner, allowed: "contracts/ and lib/", target },
    };
  }
  if (targetOwner === "contracts" || targetOwner === "lib") return undefined;
  // The CLI starts programs, so it may import each program's own front door.
  if (owner === "cli" && PROGRAMS.includes(targetOwner) && target === `${targetOwner}/index.ts`) {
    return undefined;
  }
  return { messageId: "program", data: { from: owner, target } };
}

export const importsRule = {
  meta: {
    type: "problem",
    docs: { description: "Enforce the source layout's import rules." },
    schema: [],
    messages,
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    const root = filename.lastIndexOf("/src/");
    if (root === -1) return {};
    const from = filename.slice(root + "/src/".length);

    const check = (source) => {
      if (source?.type !== "Literal" || typeof source.value !== "string") return;
      const specifier = source.value;
      const problem = specifier.startsWith(".")
        ? checkRelative(from, specifier)
        : checkPackage(from, specifier);
      if (problem) context.report({ node: source, ...problem });
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};

export default { rules: { imports: importsRule } };
