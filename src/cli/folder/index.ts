/**
 * The Shrimpy folder, where one person's setup lives by default (`~/shrimpy`,
 * or the folder `SHRIMPY_DIR` names): a home for each agent in `agents/`, the
 * sign-ins and model servers they share in `providers/`, the data of the
 * gateway and the chat server beside them, and, when the machine joined a
 * gateway as the person's own, the file that says which. It turns what a
 * command is given into a home, a bare name being the agent of that name in the
 * folder and a path being a path, and it refuses a folder that holds someone
 * else's files. It makes nothing until a command needs it. Only the command
 * line knows this folder: the programs take explicit paths, an agent's
 * `providers/` among them. It must not know how a command runs or how an agent
 * works inside its home.
 */
export {
  agentsListed,
  allHomes,
  dataFolder,
  defaultFolderPath,
  FOLDER_VARIABLE,
  folderPath,
  gatewayOfItsOwn,
  homeConfigFile,
  homeInFolder,
  homeNamed,
  isPath,
  lookForHome,
  machineFolder,
  newHome,
  nothingToStart,
  providersFolder,
  providersPath,
} from "./folder.ts";
