import type { CommandHandler } from "./framework.js";
import { completionPaths } from "./catalog.js";
import {
  renderCliHelp,
  renderCommandPathHelp,
} from "./help.js";

export const cmdHelp: CommandHandler = async (argv) => {
  if (argv.length === 0) {
    console.log(renderCliHelp());
    return 0;
  }

  if (argv.length === 1 && argv[0] === "all") {
    console.log(renderCliHelp({ full: true }));
    return 0;
  }

  if (isKnownCommandPath(argv)) {
    console.log(renderCommandPathHelp(argv));
    return 0;
  }

  console.error(`unknown help topic: ${argv.join(" ")}\n\n${renderCommandPathHelp(["help"])}`);
  return 1;
};

function isKnownCommandPath(path: readonly string[]): boolean {
  return completionPaths().some((candidate) => {
    return candidate.length === path.length && candidate.every((part, index) => path[index] === part);
  });
}
