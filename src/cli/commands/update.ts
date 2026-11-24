import { parseArgs } from "node:util";
import { compareShrimpy, releaseStep } from "../../contracts/gateway/index.ts";
import { listed } from "../../lib/text/index.ts";
import { PI_PACKAGES, SHRIMPY_RELEASE_NAME, SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { folderPath } from "../folder/index.ts";
import {
  commandOf,
  type Installed,
  isVersion,
  removeAllBut,
  SHRIMPY_ROOT,
  takeInstallLock,
  thisInstall,
  versionsHolding,
} from "../installed/index.ts";
import type { Io } from "../io/index.ts";
import { installRelease, latestVersion, readRelease } from "../releases/index.ts";
import { type Account, installedPrograms, restartApart, serviceFor, thisAccount } from "../service/index.ts";
import { parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";

const update: Command = {
  name: "update",
  usage: "[<version>]",
  summary: "Say what the latest release would change here, or install a version here and restart the service with it.",
  details: [
    "With no version it changes nothing. It reads the latest release's package.json and changelog at its tag on " +
      "GitHub, and says its version and name beside this machine's, whether it is a patch, a minor or a major, " +
      "whether its Pi packages differ from this machine's, and its changelog since this machine's version.",
    "With a version it runs that release's own install script, which puts it in ~/.local/share/shrimpy beside the " +
      "versions there and points ~/.local/bin/shrimpy at it. Then it removes every version but that one and the one " +
      "it replaced, keeping any that a service still runs, and every Node that no version left runs on. Last it " +
      "restarts the service for your Shrimpy folder, which is ~/shrimpy or the folder SHRIMPY_DIR names, by running " +
      "the new version's shrimpy install with the service's PATH. That runs apart from the service, since the restart " +
      "stops the agents it runs, the one that asked among them. With no service it says to restart shrimpy up.",
    "Going back is this command with the earlier version. On the version that runs already it changes nothing. " +
      "While another update runs in the account it fails and changes nothing. A Shrimpy that runs from a checkout " +
      "is updated with git there.",
  ].join("\n\n"),
  run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [version, extra] = positionals;
    if (extra !== undefined) throw new UsageError(`Unexpected argument: ${extra}.`);
    return updateShrimpy(io, thisAccount(), thisInstall(), version);
  },
};

/** What to say on a machine whose Shrimpy the install script didn't put there. */
const fromElsewhere = (): string => `This Shrimpy runs from ${SHRIMPY_ROOT}, not from an install, so update it there with git.`;

/** A version, with its release's name when there is one. */
const named = (version: string, name: string | undefined): string => (name === undefined ? version : `${version} · ${name}`);

/** Each Pi package whose version differs between `here` and `there`, with both versions. */
function piChanges(here: Readonly<Record<string, string>>, there: Readonly<Record<string, string>>): string[] {
  const names = [...new Set([...Object.keys(here), ...Object.keys(there)])].sort();
  return names
    .filter((name) => here[name] !== there[name])
    .map((name) => `${name.replace(/^@[^/]+\//, "")} ${here[name] ?? "none"} → ${there[name] ?? "none"}`);
}

/**
 * Say what the latest release would change on this machine, which runs `running`, and how to update to it. It
 * changes nothing.
 */
async function preview(io: Io, running: string, installed: boolean): Promise<number> {
  const latest = await readRelease(await latestVersion());
  const mine = named(running, SHRIMPY_RELEASE_NAME);
  const order = compareShrimpy(latest.version, running) ?? 1;
  if (order === 0) {
    io.out(`This machine runs Shrimpy ${mine}, the latest release.`);
    return 0;
  }
  if (order < 0) {
    io.out(`This machine runs Shrimpy ${mine}, newer than the latest release, ${named(latest.version, latest.name)}.`);
    return 0;
  }

  const step = releaseStep(running, latest.version);
  const pi = piChanges(PI_PACKAGES, latest.pi);
  io.out(`The latest release is Shrimpy ${named(latest.version, latest.name)}, and this machine runs ${mine}.`);
  io.out(
    `It is a ${step ?? "new"} release, and its Pi packages ` +
      `${pi.length === 0 ? "are the same as this machine's" : `differ from this machine's: ${pi.join(", ")}`}.`,
  );
  io.out("");
  const since = latest.changelog.filter(
    (section) => (compareShrimpy(section.version, running) ?? 0) > 0 && (compareShrimpy(section.version, latest.version) ?? 1) <= 0,
  );
  if (since.length === 0) io.out(`Its changelog says nothing since ${running}.`);
  else io.out(`Its changelog since ${running}:`);
  for (const section of since) {
    io.out("");
    io.out(section.heading);
    for (const line of section.lines) io.out(line);
  }
  io.out("");
  io.out(installed ? `Update this machine with: shrimpy update ${latest.version}` : fromElsewhere());
  return 0;
}

/**
 * Preview the latest release when `wanted` is undefined, or install version `wanted` with its own install script,
 * remove the versions and Nodes no longer wanted, and restart the service for the Shrimpy folder with the new
 * version, one update at a time. `installed` is the install this Shrimpy runs from, or undefined when it runs from a
 * checkout.
 */
export async function updateShrimpy(io: Io, account: Account, installed: Installed | undefined, wanted: string | undefined): Promise<number> {
  if (wanted === undefined) return preview(io, installed?.version ?? SHRIMPY_VERSION, installed !== undefined);
  const version = wanted.replace(/^v/, "");
  if (!isVersion(version)) throw new UsageError(`"${wanted}" isn't a version. Give one such as 1.0.0.`);
  if (installed === undefined) throw new Error(fromElsewhere());
  if (version === installed.version) {
    io.out(`This machine runs Shrimpy ${version} already, so nothing was changed.`);
    return 0;
  }

  const lock = takeInstallLock(installed);
  try {
    return await install(io, account, installed, version);
  } finally {
    lock.release();
  }
}

/** Install `version`, remove what is no longer wanted, and restart the service with it, holding the install's lock. */
async function install(io: Io, account: Account, installed: Installed, version: string): Promise<number> {
  await installRelease(version, io);

  const programs = installedPrograms(account);
  const running = versionsHolding(installed, [...programs.values()].flatMap((program) => program.argv));
  const removed = removeAllBut(installed, new Set([version, installed.version, ...running]));
  const gone = [...removed.versions.map((each) => `Shrimpy ${each}`), ...removed.nodes.map((each) => `Node ${each}`)];
  if (gone.length > 0) io.out(`Removed ${listed(gone)}.`);
  io.out(`To go back: shrimpy update ${installed.version}`);

  const folder = folderPath();
  const service = serviceFor(account, folder);
  const program = service === undefined ? undefined : programs.get(service.file);
  if (service === undefined || program === undefined) {
    io.out(`No service is installed for ${folder}. To run Shrimpy ${version} there, stop shrimpy up and start it again.`);
    return 0;
  }
  const see = await restartApart(account, service, { argv: [...commandOf(installed, version), "install"], path: program.path });
  io.out(`Restarting the service ${service.name} with Shrimpy ${version}, which stops what it runs for a moment.`);
  io.out(`See how the restart went with: ${see}`);
  return 0;
}

export const updateCommands: Command[] = [update];
