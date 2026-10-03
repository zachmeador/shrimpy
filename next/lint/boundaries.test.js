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
    // Inside one module, anything goes.
    allowed("agent/host/host.ts", "./owner-lock.ts"),
    // Other modules are reached through their front doors.
    allowed("agent/server.ts", "./host/index.ts"),
    allowed("agent/sessions/service.ts", "../../contracts/agent/index.ts"),
    allowed("agent/crash.test.ts", "../contracts/agent/node.ts"),
    allowed("contracts/agent/connect.ts", "../../lib/ids/index.ts"),
    // The CLI may start a program through the program's own front door.
    allowed("cli/commands/agent.ts", "../../agent/index.ts"),
    // Only the agent knows the engine, and only the console knows pi-tui.
    allowed("agent/host/host.ts", "@earendil-works/pi-durable/env/node"),
    allowed("clients/console/screen.ts", "@earendil-works/pi-tui"),
    // Contracts have a Node-only door, and tests may use Node anywhere.
    allowed("contracts/agent/node.ts", "node:fs"),
    allowed("contracts/agent/browser.test.ts", "node:url"),
    allowed("contracts/agent/connect.ts", "@earendil-works/pi-client"),
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
    refused("agent/server.ts", "./host/host.ts", "frontDoor"),
    refused("agent/sessions/service.ts", "../../contracts/agent/view.ts", "frontDoor"),
    refused("chat/threads/store.ts", "../../agent/index.ts", "program"),
    refused("clients/console/screen.ts", "../../agent/sessions/index.ts", "program"),
    refused("clients/web/page.ts", "../console/index.ts", "program"),
    refused("cli/commands/agent.ts", "../../agent/host/index.ts", "program"),
    refused("gateway/routes.ts", "../cli/index.ts", "program"),
    refused("lib/ids/index.ts", "../../contracts/agent/index.ts", "shared"),
    refused("contracts/agent/connect.ts", "../../agent/index.ts", "shared"),
    refused("agent/host/host.ts", "../../../test/helper.ts", "outside"),
    refused("contracts/agent/view.ts", "@earendil-works/pi-durable", "durable"),
    refused("clients/console/screen.ts", "@earendil-works/pi-durable", "durable"),
    refused("clients/web/page.ts", "@earendil-works/pi-tui", "piTui"),
    refused("clients/console/screen.ts", "@earendil-works/pi-tui/dist/editor.js", "piTui"),
    refused("contracts/agent/connect.ts", "node:fs", "browser"),
    refused("contracts/agent/connect.ts", "@earendil-works/pi-client/unix", "browser"),
    refused("contracts/agent/index.ts", "./node.ts", "browser"),
    refused("clients/web/page.ts", "../../contracts/agent/node.ts", "browser"),
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
