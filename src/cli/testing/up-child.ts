/**
 * `shrimpy up` with the times of a pace that a test gives, as a process of its
 * own, which hears signals and prints as the command does:
 *
 *   node up-child.ts <pace as JSON> [<up's arguments>...]
 */
import { loadUpWithPace, type Pace } from "../commands/index.ts";
import { forPeople, processIo } from "../io/index.ts";

const [pace, ...args] = process.argv.slice(2);
if (pace === undefined) throw new Error("usage: up-child.ts <pace as JSON> [<up's arguments>...]");
const io = forPeople(processIo());
const up = await loadUpWithPace(JSON.parse(pace) as Pace);
try {
  process.exitCode = await up.run(args, io);
} catch (error) {
  // As the command line does, a command that throws has said why and ended with 1.
  io.err(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
