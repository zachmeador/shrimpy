import { describe, it } from "node:test";
import { RuleTester } from "eslint";
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
    // Only the agent knows the engine, and only the console knows pi-tui.
    allowed("agent/host/host.ts", "@earendil-works/pi-durable/env/node"),
    allowed("clients/console/screen.ts", "@earendil-works/pi-tui"),
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
    // Test support is never shipped to a browser, even in lib/.
    allowed("lib/testing/child.ts", "node:child_process"),
    allowed("lib/testing/stand-in.ts", "../runtime/node.ts"),
    allowed("lib/testing/stand-in.ts", "@earendil-works/pi-server/unix"),
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
    refused("clients/web/page.ts", "@earendil-works/pi-tui", "piTui"),
    refused("clients/console/screen.ts", "@earendil-works/pi-tui/dist/editor.js", "piTui"),
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
