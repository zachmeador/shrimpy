import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { LockHeldError } from "../../lib/lock/node.ts";
import { tempDir } from "../../lib/testing/index.ts";
import { shellWord } from "../../lib/text/index.ts";
import { PI_PACKAGES } from "../../lib/version/index.ts";
import { FOLDER_VARIABLE, folderPath } from "../folder/index.ts";
import { commandOf, installedIn, takeInstallLock } from "../installed/index.ts";
import { type Account, put, serviceFor } from "../service/index.ts";
import { captureIo, firstOnPath } from "../testing/index.ts";
import { updateShrimpy } from "./update.ts";

/*
 * `update`, through the install script as this tree has it, against a stand-in for GitHub and nodejs.org and a
 * stand-in for the service manager. Nothing here reaches the network or a real service.
 */

const INSTALL_SCRIPT = fileURLToPath(new URL("../../../scripts/install.sh", import.meta.url));
const REPOSITORY = "zachmeador/shrimpy";

/** A release the stand-in for GitHub serves: the Node it names, its Pi packages, and its line in the changelog. */
interface Served {
  readonly version: string;
  readonly node: string;
  readonly pi: Record<string, string>;
  readonly change: string;
}

const NEWER_PI = Object.fromEntries(Object.entries(PI_PACKAGES).map(([name, version]) => [name, name.endsWith("/pi-ai") ? `${version}9` : version]));

const RELEASES: Served[] = [
  { version: "0.0.9", node: "26.0.1", pi: PI_PACKAGES, change: "Agents learned to swim." },
  { version: "0.1.0", node: "26.0.2", pi: PI_PACKAGES, change: "Rooms got tides." },
  { version: "0.2.0", node: "26.0.2", pi: NEWER_PI, change: "The reef grew a second door." },
];

/** The PATH the service runs with, which a restart keeps. */
const SERVICE_PATH = "/Users/ubuntu/Library/Application Support/tool/bin:/usr/bin:/bin";

/** Write `files` under `folder`, each at its path there. */
function writeAll(folder: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
}

/** `folder`, made into a gzipped tarball at `file` whose one folder at the top is `folder`'s last part. */
function tarball(folder: string, file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  execFileSync("tar", ["-czf", file, "-C", dirname(folder), relative(dirname(folder), folder)]);
}

/**
 * Put a curl first on this test's PATH that answers every https URL from a folder of the test's own, which holds
 * what GitHub and nodejs.org would serve of `releases`: each release's files at its tag and its archive, the Nodes
 * they name, each a script that only says its version, and GitHub's latest release, `latest`.
 */
function standInForGitHub(t: TestContext, releases: Served[], latest: string): void {
  const web = tempDir(t, "web");
  const made = tempDir(t, "made");
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";

  for (const [index, release] of releases.entries()) {
    const changelog = releases
      .slice(0, index + 1)
      .reverse()
      .map((each) => `## 🦐 ${each.version} - Tide ${each.version} - 2026-11-24\n\n- ${each.change}\n`);
    const files = {
      "package.json": JSON.stringify({ name: "shrimpy", version: release.version, dependencies: release.pi }),
      ".node-version": `${release.node}\n`,
      "CHANGELOG.md": ["# 🦐 Shrimpy Changelog", "## 🦐 Unreleased", ...changelog].join("\n\n"),
      "bin/shrimpy.js": "",
      "scripts/install.sh": readFileSync(INSTALL_SCRIPT, "utf8"),
    };
    writeAll(join(web, "raw.githubusercontent.com", REPOSITORY, `v${release.version}`), files);
    const source = join(made, `shrimpy-${release.version}`);
    writeAll(source, files);
    tarball(source, join(web, "github.com", REPOSITORY, "archive", "refs", "tags", `v${release.version}.tar.gz`));
  }

  for (const node of new Set(releases.map((release) => release.node))) {
    const name = `node-v${node}-${os}-${arch}`;
    writeAll(join(made, name), { "bin/node": `#!/bin/sh\necho v${node}\n`, "bin/npm": "#!/bin/sh\nexit 0\n" });
    for (const program of ["node", "npm"]) chmodSync(join(made, name, "bin", program), 0o755);
    const archive = join(web, "nodejs.org", "dist", `v${node}`, `${name}.tar.gz`);
    tarball(join(made, name), archive);
    const sum = createHash("sha256").update(readFileSync(archive)).digest("hex");
    writeFileSync(join(dirname(archive), "SHASUMS256.txt"), `${sum}  ${name}.tar.gz\n`);
  }

  writeAll(join(web, "github.com", REPOSITORY, "releases"), {
    "latest.redirect": `https://github.com/${REPOSITORY}/releases/tag/v${latest}`,
  });

  const bin = tempDir(t, "curl");
  writeFileSync(
    join(bin, "curl"),
    [
      "#!/bin/sh",
      'out=""; format=""; url=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in -o) out="$2"; shift ;; -w) format="$2"; shift ;; -*) ;; *) url="$1" ;; esac',
      "  shift",
      "done",
      `file=${shellWord(web)}/"\${url#https://}"`,
      'if [ -n "$format" ]; then cat "$file.redirect" 2>/dev/null; exit 0; fi',
      '[ -f "$file" ] || { echo "curl: (22) The requested URL returned error: 404" >&2; exit 22; }',
      'if [ -n "$out" ]; then cp "$file" "$out"; else cat "$file"; fi',
      "",
    ].join("\n"),
  );
  chmodSync(join(bin, "curl"), 0o755);
  firstOnPath(t, bin);
}

/** A restart the stand-in for the service manager was asked to start apart from the service. */
interface Restart {
  readonly argv: string[];
  readonly variables: Record<string, string>;
}

/** An account of the test's own on `platform`, whose service manager answers that nothing is loaded and records the rest. */
function standInAccount(platform: NodeJS.Platform): { account: Account; ran: string[]; restarts: Restart[] } {
  const ran: string[] = [];
  const restarts: Restart[] = [];
  const account: Account = {
    platform,
    home: process.env.HOME ?? "",
    user: "ubuntu",
    uid: 501,
    path: "/usr/bin:/bin",
    lang: undefined,
    run(command, args) {
      ran.push([command, ...args].join(" "));
      if (command === "systemd-run") {
        const end = args.indexOf("--");
        const variables = args
          .slice(0, end)
          .filter((arg) => arg.startsWith("--setenv="))
          .map((arg): [string, string] => {
            const [name = "", value = ""] = arg.slice("--setenv=".length).split(/=(.*)/s);
            return [name, value];
          });
        restarts.push({ argv: args.slice(end + 1), variables: Object.fromEntries(variables) });
      }
      if (command === "launchctl" && args[0] === "print") return Promise.resolve({ code: 113, stdout: "", stderr: "" });
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    },
    detach(command, args, variables) {
      ran.push([command, ...args].join(" "));
      restarts.push({ argv: [command, ...args], variables });
      return Promise.resolve();
    },
  };
  return { account, ran, restarts };
}

/** Every file under `folder` with a hash of what it holds, so that a change to any of them shows. */
function snapshot(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = join(entry.parentPath, entry.name);
      return `${relative(folder, file)} ${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
    })
    .sort();
}

const entries = (folder: string): string[] => (existsSync(folder) ? readdirSync(folder).filter((name) => !name.startsWith(".")).sort() : []);

for (const platform of ["linux", "darwin"] as const) {
  test(`on ${platform}, update previews and changes nothing, then keeps two versions, restarts the service with the new one, and goes back`, async (t) => {
    const home = process.env.HOME ?? "";
    standInForGitHub(t, RELEASES, "0.2.0");
    const { account, ran, restarts } = standInAccount(platform);
    const folder = folderPath();
    const at = (version: string) => installedIn(home, version);
    const { versions, nodes } = at("0.1.0");
    const runs = (version: string): string[] => commandOf(at(version), version);

    for (const version of ["0.0.9", "0.1.0"]) execFileSync("bash", [INSTALL_SCRIPT, version], { stdio: "pipe" });
    // The folder's service runs 0.1.0, and another folder's runs 0.0.9.
    const service = serviceFor(account, folder);
    const other = serviceFor(account, join(tempDir(t, "other"), "shrimpy"));
    assert.ok(service !== undefined && other !== undefined);
    await put(account, service, { argv: [...runs("0.1.0"), "up"], path: SERVICE_PATH, lang: undefined });
    await put(account, other, { argv: [...runs("0.0.9"), "up"], path: SERVICE_PATH, lang: undefined });

    const before = snapshot(home);
    const asked = ran.length;
    const previewed = captureIo();
    assert.equal(await updateShrimpy(previewed.io, account, at("0.1.0"), undefined), 0, previewed.err.join("\n"));
    assert.deepEqual(snapshot(home), before, "the preview changes nothing");
    assert.equal(ran.length, asked, "and asks the service manager nothing");
    const said = previewed.out.join("\n");
    assert.ok(said.includes("0.2.0") && said.includes("The reef grew a second door."), said);
    assert.ok(!said.includes("Rooms got tides."), "the changelog starts after this machine's version");
    assert.ok(said.includes("pi-ai"), "it names the Pi package that differs");

    const updated = captureIo();
    assert.equal(await updateShrimpy(updated.io, account, at("0.1.0"), "0.2.0"), 0, updated.err.join("\n"));
    assert.deepEqual(entries(versions), ["0.0.9", "0.1.0", "0.2.0"], "the one it replaced stays, and so does one another service runs");
    assert.ok(readFileSync(join(home, ".local", "bin", "shrimpy"), "utf8").includes(runs("0.2.0")[1] ?? ""), "the command runs the new version");
    // launchd gives a service no language, so a LaunchAgent names one, and the restart keeps it.
    const language = platform === "darwin" ? { LANG: "C.UTF-8" } : {};
    assert.deepEqual(restarts, [{ argv: [...runs("0.2.0"), "install"], variables: { PATH: SERVICE_PATH, ...language, [FOLDER_VARIABLE]: folder } }]);

    // What the new version's shrimpy install writes, and the other folder's service taken away.
    await put(account, service, { argv: [...runs("0.2.0"), "up"], path: SERVICE_PATH, lang: undefined });
    rmSync(other.file);

    const back = captureIo();
    assert.equal(await updateShrimpy(back.io, account, at("0.2.0"), "0.1.0"), 0, back.err.join("\n"));
    assert.deepEqual(entries(versions), ["0.1.0", "0.2.0"]);
    assert.deepEqual(entries(nodes), ["26.0.2"], "the Node only 0.0.9 ran on goes with it");
    assert.ok(readFileSync(join(home, ".local", "bin", "shrimpy"), "utf8").includes(runs("0.1.0")[1] ?? ""), "the command runs 0.1.0 again");
    assert.deepEqual(restarts.at(-1)?.argv, [...runs("0.1.0"), "install"]);

    // On the version that runs already, nothing changes and nothing restarts, as when a turn that asked is run again.
    const settled = snapshot(home);
    const count = ran.length;
    assert.equal(await updateShrimpy(captureIo().io, account, at("0.1.0"), "0.1.0"), 0);
    assert.deepEqual(snapshot(home), settled);
    assert.equal(ran.length, count);

    // While another update runs, as when several agents of the machine start one at once, this one changes nothing.
    const another = takeInstallLock(at("0.1.0"));
    await assert.rejects(updateShrimpy(captureIo().io, account, at("0.1.0"), "0.2.0"), LockHeldError);
    another.release();
    assert.deepEqual(snapshot(home), settled);
    assert.equal(ran.length, count);
  });
}
