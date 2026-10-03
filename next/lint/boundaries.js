/**
 * The import rules of the source layout, as one ESLint rule. See
 * docs/REDESIGN/PLAN.md, "Target source layout".
 */
import { isBuiltin } from "node:module";
import { posix } from "node:path";

const PROGRAMS = ["agent", "chat", "gateway", "clients/console", "clients/web", "cli"];
const FRONT_DOORS = ["index.ts", "node.ts"];

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
  piTui: "Only clients/console/ imports pi-tui, and only from the package root.",
  browser: "Browser-safe code must not import {{target}}: what needs Node sits behind a node.ts door.",
};

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
  if (/^@earendil-works\/pi-durable(\/|$)/.test(specifier) && owner !== "agent") {
    return { messageId: "durable" };
  }
  if (/^@earendil-works\/pi-tui(\/|$)/.test(specifier)) {
    if (owner !== "clients/console" || specifier !== "@earendil-works/pi-tui") {
      return { messageId: "piTui" };
    }
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
