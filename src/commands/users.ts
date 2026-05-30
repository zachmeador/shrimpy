import { createAppRuntime } from "../app/index.js";
import { IdentityStore } from "../gateway/identity-store.js";
import {
  parseCommandArgs,
  printError,
  showUsage,
  usage,
  type CommandHandler,
} from "./framework.js";

const USAGE = `usage:
  shrimpy users list [--json]
  shrimpy users get-owner [--json]
  shrimpy users set-owner <userId>`;

export const cmdUsers: CommandHandler = async (argv, config) => {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const sub = positionals[0];
  if (!sub) return showUsage(USAGE);

  const runtime = createAppRuntime(config);
  const store = new IdentityStore(runtime.paths.usersPath);
  const json = values.json ?? false;

  if (sub === "list") {
    const owner = store.getOwner();
    const links = store.listLinks();
    if (json) {
      console.log(JSON.stringify({ owner, links }, null, 2));
      return 0;
    }
    console.log(`owner: ${owner ?? "(unset)"}`);
    if (links.length === 0) {
      console.log("(no identity links)");
    } else {
      for (const { key, link } of links) {
        const ownerMark = link.userId === owner ? " *owner*" : "";
        console.log(
          `  ${key} -> ${link.actorId} (${link.displayName ?? link.userId})${ownerMark}`,
        );
      }
    }
    return 0;
  }

  if (sub === "get-owner") {
    const identity = store.getOwnerIdentity();
    if (json) {
      console.log(JSON.stringify(identity ?? null, null, 2));
      return 0;
    }
    if (!identity) {
      console.log("(no owner set)");
      return 0;
    }
    console.log(`${identity.userId} -> ${identity.actorId}${identity.displayName ? ` (${identity.displayName})` : ""}`);
    return 0;
  }

  if (sub === "set-owner") {
    const userId = positionals[1];
    if (!userId) return printError("userId required");
    const known = store.listLinks().some(({ link }) => link.userId === userId);
    if (!known) {
      console.warn(
        `warning: no identity link found with userId "${userId}". Setting anyway; CLI will fall back to defaults until a matching link exists.`,
      );
    }
    store.setOwner(userId);
    console.log(`owner set: ${userId}`);
    return 0;
  }

  usage(USAGE, `unknown subcommand: ${sub}`);
};
