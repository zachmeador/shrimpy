import { describe, it } from "node:test";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { importsRule } from "./boundaries.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// The TypeScript parser, so that an import of a type is checked like any other.
const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2023, sourceType: "module" },
});

const file = (path) => `/repo/src/${path}`;
const allowed = (path, specifier) => ({
  filename: file(path),
  code: `import x from ${JSON.stringify(specifier)};`,
});
const refused = (path, specifier, messageId) => ({
  ...allowed(path, specifier),
  errors: [{ messageId }],
});

// Each rule has a case that is allowed and a case that is refused, named by the message the rule gives.
tester.run("imports", importsRule, {
  valid: [
    // frontDoor and parent: a file reaches the files of its own directory, and any other directory through its front door.
    allowed("agent/host/host.ts", "./owner-lock.ts"),
    allowed("agent/server.ts", "./host/index.ts"),
    allowed("agent/server.ts", "./home/node.ts"),
    allowed("cli/commands/sessions.ts", "../io/index.ts"),
    // program and shared: programs meet in contracts/ and lib/, and the CLI starts a program through its front door.
    allowed("agent/sessions/service.ts", "../../contracts/agent/index.ts"),
    allowed("cli/commands/agent.ts", "../../agent/index.ts"),
    allowed("contracts/agent/connect.ts", "../../lib/ids/index.ts"),
    // provider: a chat provider sees the provider interface.
    allowed("chat/providers/telegram/poller.ts", "../index.ts"),
    // testing: tests import test support.
    allowed("agent/agent.test.ts", "./testing/index.ts"),
    // durable and durableInAgent: only the host, the sessions, the message tools and the context of the agent know the engine.
    allowed("agent/host/host.ts", "@earendil-works/pi-durable/env/node"),
    allowed("agent/sessions/session-view.ts", "@earendil-works/pi-durable"),
    // piTui, piTuiDraw and drawing: only the console's drawing knows pi-tui, and the top of the console starts the drawing.
    allowed("clients/console/draw/screen.ts", "@earendil-works/pi-tui"),
    allowed("clients/console/console.ts", "./draw/index.ts"),
    // browser: a Node door may use Node, and so may tests and test support, which are never shipped.
    allowed("contracts/agent/node.ts", "node:fs"),
    allowed("lib/testing/child.ts", "node:child_process"),
    allowed("contracts/agent/browser.test.ts", "node:url"),
    // Files outside src/ are not this rule's business.
    { filename: "/repo/lint/boundaries.js", code: 'import x from "../src/agent/host/host.ts";' },
  ],
  invalid: [
    refused("agent/host/host.ts", "../../../test/helper.ts", "outside"),
    // Below or beside a directory is not inside it: only its front door is open.
    refused("agent/server.ts", "./host/host.ts", "frontDoor"),
    refused("cli/commands/agent.ts", "../io.ts", "parent"),
    // Programs share only contracts/ and lib/. The CLI reaches another program's front door and nothing more.
    refused("chat/threads/store.ts", "../../agent/index.ts", "program"),
    refused("cli/flow.test.ts", "../agent/testing/index.ts", "program"),
    refused("lib/ids/index.ts", "../../contracts/agent/index.ts", "shared"),
    refused("chat/providers/telegram/poller.ts", "../../store/index.ts", "provider"),
    refused("agent/server.ts", "./testing/index.ts", "testing"),
    refused("contracts/agent/view.ts", "@earendil-works/pi-durable", "durable"),
    // A type is still the engine's: the code that takes messages in imports none of it, even for a type.
    {
      filename: file("agent/chat/feed.ts"),
      code: 'import type { Harness } from "@earendil-works/pi-durable";',
      errors: [{ messageId: "durableInAgent" }],
    },
    // pi-tui is the console's alone, and only from the package root.
    refused("clients/web/page.ts", "@earendil-works/pi-tui", "piTui"),
    refused("clients/console/draw/screen.ts", "@earendil-works/pi-tui/dist/index.js", "piTui"),
    refused("clients/console/state/store.ts", "@earendil-works/pi-tui", "piTuiDraw"),
    refused("clients/console/state/store.ts", "../draw/index.ts", "drawing"),
    // Code that must run in a browser reaches Node neither directly nor through a door that says it needs Node.
    refused("contracts/agent/connect.ts", "node:fs", "browser"),
    refused("contracts/agent/index.ts", "./node.ts", "browser"),
    // Every way to import is checked, not only the import declaration.
    {
      filename: file("clients/web/page.ts"),
      code: 'await import("../../agent/index.ts");',
      errors: [{ messageId: "program" }],
    },
    {
      filename: file("chat/offers/offer.ts"),
      code: 'export * from "../../agent/index.ts";',
      errors: [{ messageId: "program" }],
    },
    {
      filename: file("chat/offers/offer.ts"),
      code: 'export { startAgent } from "../../agent/index.ts";',
      errors: [{ messageId: "program" }],
    },
  ],
});
