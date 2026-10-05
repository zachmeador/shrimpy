# 🦐 The contracts between them

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

A contract says what a message, a session view and a registration are. Agents on other machines, other versions and other clients depend on these.

**The design**

Clients use two APIs, each the same for local and gateway-routed use. The chat server's API covers channels, threads, members, posting and reading messages with their attachments, and subscriptions. Each agent's API is a set of concrete operations:

- session inspection and selection
- reset, fork, steer, status, wait, withdraw and stop
- model, thinking, defaults and reload
- provider login, relaying Pi's login prompts to the person's client
- raw and effective context, entry queries and committed subscriptions
- completion against the agent's filesystem
- publication and chat-provider status, trigger and delegation controls
- receiving the attachments of offered messages into the agent's home

Commands, clients and tools call the same operations. Which of them get a command follows the [rule for commands](using-it.md). For transport, use `pi-server`, `pi-client` and `pi-protocol` over a restricted local Unix socket first, where their public APIs fit. Coding-agent's experimental controller isn't reused wholesale because it drops durable request IDs. Pi's protocol carries everything Shrimpy ships: the console, the web client, the CLI, the chat server, and each agent's link to the gateway. Plain HTTP is added only when a program that can't speak Pi's protocol needs in, and not yet. Only a Unix socket transport ships, so the web client needs a small WebSocket bridge; the spike's was 69 lines. Sockets live in a short runtime directory, because macOS caps Unix socket paths at 104 bytes. `pi-client` never reconnects on its own, so clients reconnect with backoff and mark a disconnected view as stale. The browser bundle is about 200 KB minified and 53 KB gzipped, mostly TypeBox. The protocol makes no compatibility promises, so Shrimpy pins Pi exactly, agents and clients upgrade together, and a version mismatch between peers is reported clearly.

Contracts carry Shrimpy-owned shapes only: the agent builds the session view that clients draw, so no client depends on Pi's record types. Clients talk through threads and watch through sessions. Attaching straight to an agent covers watching, steering and stopping, including while the gateway is down. Clients render committed views. Help, status and editor state stay local and never enter the transcript. Completion and shell input run against the agent's paths, never the client's cwd, so an attached console asks the agent for completions instead of reading a local directory. Clipboard files and images attach to the message you send, like any other attachment, with provenance and size limits.

**Decisions**

None.

**Open**

**Decide first:** how peers stay compatible across machines. Pi's protocol makes no compatibility promises, so every program upgrades together today. That works on one machine. With agents on other machines, updating one side breaks every agent that hasn't updated yet. The link that crosses machines is small: an agent talking to chat and the gateway. Either that link gets a stable protocol of its own, or lockstep upgrades are accepted with a clear report of the mismatch. The MVP takes the second: every program runs the same version, and a mismatch is reported.

A proposal about facts and decisions is waiting: [facts and decisions, proposed](../proposals/facts-and-decisions.md).
