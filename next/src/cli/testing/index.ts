/**
 * Test support for the CLI: captured output, a model that speaks OpenAI's
 * protocol on a local port, and the CLI itself as a child process. Only tests
 * and test fixtures import this.
 */
export { declareLocalModel, eventually } from "./home.ts";
export { type CapturedIo, captureIo } from "./io.ts";
export { type ModelRequest, type ModelServer, startModelServer } from "./model-server.ts";
export { type CliResult, type ServedAgent, serve, shrimpy } from "./process.ts";
