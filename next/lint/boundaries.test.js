import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { importsRule } from "./boundaries.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2023, sourceType: "module" } });

const file = (path) => `/repo/next/src/${path}`;
const allowed = (path, specifier) => ({
  filename: file(path),
  code: `import x from ${JSON.stringify(specifier)};`,
});
const refused = (path, specifier, messageId) => ({
  ...allowed(path, specifier),
  errors: [{ messageId }],
});

tester.run("imports", importsRule, {
  valid: [
    // A file reaches the files of its own directory.
    allowed("agent/host/host.ts", "./owner-lock.ts"),
    allowed("agent/host/host.test.ts", "./host.ts"),
    allowed("cli/commands/agent.ts", "./command.ts"),
    // Any other directory is reached through its front door, whether it sits below, beside or above.
    allowed("agent/server.ts", "./host/index.ts"),
    allowed("agent/server.ts", "./home/node.ts"),
    allowed("chat/threads/messages.ts", "../input/index.ts"),
    allowed("cli/commands/sessions.ts", "../io/index.ts"),
    allowed("cli/run.ts", "./commands/index.ts"),
    allowed("agent/sessions/service.ts", "../../contracts/agent/index.ts"),
    allowed("agent/crash.test.ts", "../contracts/agent/node.ts"),
    allowed("cli/testing/io.ts", "../io/index.ts"),
    allowed("contracts/agent/connect.ts", "../../lib/ids/index.ts"),
    // The CLI may start a program through the program's own front door.
    allowed("cli/commands/agent.ts", "../../agent/index.ts"),
    // It reaches a running agent through the contract, including the Node-only door.
    allowed("cli/commands/sessions.ts", "../../contracts/agent/node.ts"),
    allowed("cli/commands/sessions.ts", "../../lib/json-config/index.ts"),
    allowed("cli/flow.test.ts", "./testing/index.ts"),
    // Programs share small helpers through lib/.
    allowed("agent/home/agent-config.ts", "../../lib/json-config/index.ts"),
    // Only the agent knows the engine, and only the console's drawing knows pi-tui, tests and test support of it included.
    allowed("agent/host/host.ts", "@earendil-works/pi-durable/env/node"),
    allowed("clients/console/draw/screen.ts", "@earendil-works/pi-tui"),
    allowed("clients/console/draw/screen.test.ts", "@earendil-works/pi-tui"),
    allowed("clients/console/draw/testing/terminal.ts", "@earendil-works/pi-tui"),
    // The top of the console starts the drawing through its front door, and the drawing reaches the rest the same way.
    allowed("clients/console/console.ts", "./draw/index.ts"),
    allowed("clients/console/draw/screen.ts", "../state/index.ts"),
    allowed("clients/console/state/store.ts", "../network/index.ts"),
    // Inside the agent, the engine belongs to the host, the sessions and the durable extensions, tests of theirs included.
    allowed("agent/host/models.test.ts", "@earendil-works/pi-durable"),
    allowed("agent/sessions/session-view.ts", "@earendil-works/pi-durable"),
    allowed("agent/sessions/turns.ts", "@earendil-works/pi-durable"),
    allowed("agent/extensions/context/sections.ts", "@earendil-works/pi-durable"),
    // Contracts have a Node-only door, and tests may use Node anywhere.
    allowed("contracts/agent/node.ts", "node:fs"),
    allowed("contracts/agent/browser.test.ts", "node:url"),
    allowed("contracts/agent/connect.ts", "@earendil-works/pi-client"),
    // So do lib/ modules: Node sits behind a node.ts door, in the door or in a file named for it.
    allowed("lib/json-config/node.ts", "node:fs"),
    allowed("lib/json-config/node.ts", "./parse.ts"),
    allowed("lib/lock/node.ts", "./lock.node.ts"),
    allowed("lib/lock/lock.node.ts", "node:sqlite"),
    allowed("lib/lock/lock.node.ts", "../runtime/node.ts"),
    allowed("lib/offer/offer.ts", "@earendil-works/chord"),
    allowed("lib/connection/connection.ts", "@earendil-works/pi-client"),
    allowed("lib/lock/lock.test.ts", "node:fs"),
    // Programs and the contracts' Node doors reach lib/'s Node doors.
    allowed("agent/server.ts", "../lib/runtime/node.ts"),
    allowed("contracts/gateway/node.ts", "../../lib/runtime/node.ts"),
    // Test support is never shipped to a browser, even in lib/ and the contracts.
    allowed("lib/testing/child.ts", "node:child_process"),
    allowed("lib/testing/stand-in.ts", "../runtime/node.ts"),
    allowed("lib/testing/stand-in.ts", "@earendil-works/pi-server/unix"),
    allowed("contracts/gateway/testing/gateway.ts", "node:test"),
    allowed("contracts/gateway/testing/gateway.ts", "../../../lib/testing/index.ts"),
    allowed("contracts/gateway/testing/gateway.ts", "../index.ts"),
    // Test support is for tests and other test support.
    allowed("agent/agent.test.ts", "./testing/index.ts"),
    allowed("agent/testing/agent-child.ts", "../index.ts"),
    // A chat provider sees the provider interface and lib/.
    allowed("chat/providers/telegram/poller.ts", "../index.ts"),
    allowed("chat/providers/telegram/poller.ts", "../../../lib/retry/index.ts"),
    // Files outside src/ are not this rule's business.
    { filename: "/repo/next/lint/boundaries.js", code: 'import x from "../src/agent/host/host.ts";' },
    { filename: file("agent/index.ts"), code: 'export { openHost } from "./host/index.ts";' },
    { filename: file("cli/main.ts"), code: 'await import("../agent/index.ts");' },
  ],
  invalid: [
    // Below or beside a directory is not inside it: only its front door is open.
    refused("agent/server.ts", "./host/host.ts", "frontDoor"),
    refused("agent/crash.test.ts", "./host/owner-lock.ts", "frontDoor"),
    refused("chat/threads/messages.ts", "../store/store.ts", "frontDoor"),
    refused("chat/threads/messages.ts", "../input/limits.ts", "frontDoor"),
    // A directory's files are not open to the directories inside it, however deep, or to their tests and test support.
    refused("cli/commands/agent.ts", "../io.ts", "parent"),
    refused("cli/commands/render.test.ts", "../usage-error.ts", "parent"),
    refused("cli/testing/io.ts", "../io.ts", "parent"),
    refused("agent/sessions/deep/view.ts", "../../server.ts", "parent"),
    refused("agent/sessions/deep/view.ts", "../service.ts", "parent"),
    refused("agent/sessions/service.ts", "../../contracts/agent/view.ts", "frontDoor"),
    refused("chat/threads/store.ts", "../../agent/index.ts", "program"),
    refused("clients/console/screen.ts", "../../agent/sessions/index.ts", "program"),
    refused("clients/web/page.ts", "../console/index.ts", "program"),
    refused("cli/commands/agent.ts", "../../agent/host/index.ts", "program"),
    refused("cli/commands/agent.ts", "../../agent/home/index.ts", "program"),
    // Another program's test support is still another program.
    refused("cli/flow.test.ts", "../agent/testing/index.ts", "program"),
    refused("cli/commands/sessions.ts", "../../lib/json-config/config-object.ts", "frontDoor"),
    refused("gateway/routes.ts", "../cli/index.ts", "program"),
    refused("lib/ids/index.ts", "../../contracts/agent/index.ts", "shared"),
    refused("contracts/agent/connect.ts", "../../agent/index.ts", "shared"),
    refused("agent/host/host.ts", "../../../test/helper.ts", "outside"),
    refused("contracts/agent/view.ts", "@earendil-works/pi-durable", "durable"),
    refused("clients/console/screen.ts", "@earendil-works/pi-durable", "durable"),
    // Nothing else in the agent does, and the code that takes messages in not even for a type.
    refused("agent/intake/feed.ts", "@earendil-works/pi-durable", "durableInAgent"),
    refused("agent/intake/feed.ts", "@earendil-works/pi-durable/storage/sqlite/node", "durableInAgent"),
    refused("agent/intake/testing/turns.ts", "@earendil-works/pi-durable", "durableInAgent"),
    refused("agent/links/chat.ts", "@earendil-works/pi-durable", "durableInAgent"),
    refused("agent/home/load.ts", "@earendil-works/pi-durable", "durableInAgent"),
    refused("agent/testing/index.ts", "@earendil-works/pi-durable", "durableInAgent"),
    refused("agent/server.ts", "@earendil-works/pi-durable", "durableInAgent"),
    refused("agent/index.ts", "@earendil-works/pi-durable", "durableInAgent"),
    refused("agent/agent.test.ts", "@earendil-works/pi-durable", "durableInAgent"),
    refused("clients/web/page.ts", "@earendil-works/pi-tui", "piTui"),
    refused("clients/console/draw/screen.ts", "@earendil-works/pi-tui/dist/editor.js", "piTui"),
    refused("clients/console/draw/screen.ts", "@earendil-works/pi-tui/dist/index.js", "piTui"),
    refused("cli/commands/read.ts", "@earendil-works/pi-tui", "piTui"),
    // Inside the console only the drawing imports it, so the client works without a terminal.
    refused("clients/console/screen.ts", "@earendil-works/pi-tui", "piTuiDraw"),
    refused("clients/console/index.ts", "@earendil-works/pi-tui", "piTuiDraw"),
    refused("clients/console/state/store.ts", "@earendil-works/pi-tui", "piTuiDraw"),
    refused("clients/console/state/store.test.ts", "@earendil-works/pi-tui", "piTuiDraw"),
    refused("clients/console/network/testing/watching.ts", "@earendil-works/pi-tui", "piTuiDraw"),
    // And nothing below the top of the console imports the drawing, so pi-tui can't arrive through it.
    refused("clients/console/state/store.ts", "../draw/index.ts", "drawing"),
    refused("clients/console/network/chat.ts", "../draw/index.ts", "drawing"),
    refused("clients/console/screen/screen.test.ts", "../draw/index.ts", "drawing"),
    refused("contracts/agent/connect.ts", "node:fs", "browser"),
    refused("contracts/agent/connect.ts", "fs", "browser"),
    refused("contracts/agent/connect.ts", "@earendil-works/pi-client/unix", "browser"),
    refused("contracts/agent/index.ts", "./node.ts", "browser"),
    refused("clients/web/page.ts", "../../contracts/agent/node.ts", "browser"),
    // A lib/ module's index.ts and everything behind it is browser-safe too.
    refused("lib/retry/backoff.ts", "node:fs", "browser"),
    refused("lib/retry/backoff.ts", "fs", "browser"),
    refused("lib/retry/backoff.ts", "path/posix", "browser"),
    refused("lib/connection/connection.ts", "@earendil-works/pi-client/unix", "browser"),
    refused("lib/retry/index.ts", "./node.ts", "browser"),
    refused("lib/uri/index.ts", "./decode.node.ts", "browser"),
    refused("lib/offer/offer.ts", "../runtime/node.ts", "browser"),
    refused("contracts/gateway/connect.ts", "../../lib/runtime/node.ts", "browser"),
    // A file that needs Node says so in its name, and only then.
    refused("lib/lock/lock.ts", "node:sqlite", "browser"),
    refused("lib/lock/lock.ts", "../runtime/node.ts", "browser"),
    // Only a door is open to other directories, so a file named for Node is not.
    refused("lib/offer/offer.ts", "../lock/lock.node.ts", "frontDoor"),
    refused("agent/server.ts", "./testing/index.ts", "testing"),
    refused("chat/providers/telegram/poller.ts", "../../store/index.ts", "provider"),
    refused("chat/providers/telegram/poller.ts", "../../../contracts/chat/index.ts", "provider"),
    {
      filename: file("chat/offers/offer.ts"),
      code: 'export * from "../../agent/index.ts";',
      errors: [{ messageId: "program" }],
    },
    {
      filename: file("clients/web/page.ts"),
      code: 'await import("../../agent/index.ts");',
      errors: [{ messageId: "program" }],
    },
  ],
});

// A type is still the engine's: the code that takes messages in imports none of it, even for a type.
const typed = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2023, sourceType: "module" },
});

typed.run("imports of types", importsRule, {
  valid: [
    { filename: file("agent/sessions/service.ts"), code: 'import type { Harness } from "@earendil-works/pi-durable";' },
    { filename: file("agent/intake/feed.ts"), code: 'import type { Message } from "../../contracts/chat/index.ts";' },
  ],
  invalid: [
    {
      filename: file("agent/intake/feed.ts"),
      code: 'import type { Harness } from "@earendil-works/pi-durable";',
      errors: [{ messageId: "durableInAgent" }],
    },
    {
      filename: file("agent/intake/feed.ts"),
      code: 'import { type Tx } from "@earendil-works/pi-durable";',
      errors: [{ messageId: "durableInAgent" }],
    },
    {
      filename: file("agent/intake/feed.ts"),
      code: 'export type { Tx } from "@earendil-works/pi-durable";',
      errors: [{ messageId: "durableInAgent" }],
    },
  ],
});
