# 🦐 Self-Hosted Claude Managed Agents

Originally researched: 2026-11-12
Status: Research; nothing adopted, installed or run

The question: Anthropic announced self-hosted Claude Managed Agents on 2026-11-12. What is it, could Shrimpy build on it or use it, and what does its design say about Shrimpy's?

The announcement, four of Anthropic's docs pages and its engineering post on the Managed Agents architecture were read on 2026-11-12, all linked under [Sources](#sources). The docs pages were read whole; the announcement and the post were read through a fetching tool's summaries and short quotes. Nothing was installed, since the download comes through an Anthropic account team. Statements come from those sources or from Shrimpy's design docs, unless marked **(I)** for the research's inference.

## Current recommendation

**Shrimpy shouldn't build on it, and nothing in Shrimpy's core needs to change for it (I).** It runs only Claude models, it's a gated download with a server and a database to run, and its agents work in sessions with no home of their own, so the home, rooms, identity and network would all still be Shrimpy's to build. Pi Durable stays the engine.

- **Its lesson is where the security line goes.** Managed Agents keeps the agent loop, the session log and the secrets outside the sandbox, so code the model writes never reaches a token. Shrimpy's confirmed design puts the whole agent in the sandbox, keys included. Shrimpy's choice still fits Shrimpy **(I)**, for the reasons under [where they differ](#where-they-differ-the-boundary). Their point lands on one thing: every agent started in a folder can read that folder's sign-in from its shell **(I)**.
- **An agent could use it later.** With an API key and a skill, an agent could hand an unattended job to a Managed Agents session through Anthropic's `ant` CLI **(I)**. The job wouldn't show in Shrimpy's clients, the gap the [coding-agents scout](coding-agents-scout-2026-11-11.md) found for detached jobs.

What the research would do **(I)**:

1. Have the `shrimpy-agents` skill say that an agent which reads untrusted input, such as web pages, email or other people's messages, runs apart: with a folder and a sign-in of its own, or behind a proxy that injects its key. No skill says so yet. See [For the owner](#for-the-owner).
2. Nothing else before the release.

## What it is

Managed Agents runs Claude as an agent: a person or a program defines an agent, starts a session and exchanges events with it while it works. Anthropic launched it as a hosted service, then let customers run the sandboxes, and now lets them run the whole service.

| Option | Sandboxes | Service | Model |
|---|---|---|---|
| Cloud sandboxes, the default | Anthropic | Anthropic | Anthropic |
| Self-hosted sandboxes | The customer | Anthropic | Anthropic |
| Self-hosted Managed Agents | The customer | The customer | Anthropic, or a provider the customer picks |

A self-hosted deployment runs:

- **`cma-server`**, which serves the API, runs the agent loop, and stores agents, sessions and their history. It never runs an agent's shell or file tools.
- **PostgreSQL 16 or later.** Without it the server keeps everything in memory, and a restart erases it.
- **Workers**, an `ant beta:worker` command or an SDK worker, which poll the server for work and run the shell and file tools in the customer's sandboxes. The Docker Compose stack and the `cma-sandboxes` Helm chart start each session's worker in a container or pod of its own. The server never connects to a worker.
- **A console** at the server's address, which people sign in to through the customer's identity provider, and **`cma-server-admin`**, which makes environments and their keys.

The API is the hosted service's, so the SDKs and `ant` work against it. The customer installs each release, and each comes with an `operator-guide.md` that the docs suggest having Claude read.

- **Models.** Agents name models by their Claude API IDs. The server calls the Claude API by default, or Amazon Bedrock, Claude Models on Google Cloud, Microsoft Foundry, or a gateway the customer runs that takes the Messages, Bedrock or Vertex request format. A gateway's model ID has to name the same model the agent names, so only Claude models run on it **(I)**.
- **What leaves the network.** Each model call carries the conversation so far to the inference provider. The server connects to Anthropic only when that provider is the Claude API, and those calls carry the session, agent and environment IDs in headers that no setting turns off. Anthropic has no remote access to the server.
- **Credentials.** Vault credentials stay out of the sandbox. An optional egress gateway sits between the sandboxes and the internet, and adds stored credential values to calls to the hosts listed for it.
- **Trust.** Each deployment serves one tenant at one trust level, since the server API key reaches every environment. The agent's `bash` is a real shell with the worker's permissions and network, and the worker doesn't isolate it: isolation comes from whatever the worker runs in.
- **Availability.** A private beta, requested through an Anthropic account team. The pages read give neither its price nor the license terms of the download.

## The architecture: brain, hands and session

Anthropic's [engineering post](https://www.anthropic.com/engineering/managed-agents) of 2026-04-08 splits an agent into three parts, each replaceable without the others:

- **The session**, an append-only log of everything that happened, kept outside the other two.
- **The harness**, the loop that calls Claude and routes its tool calls: the brain. It holds no state. After a crash a new one starts with `wake(sessionId)`, reads the log and goes on from the last event.
- **The sandbox**, where Claude runs code and edits files: the hands. The harness reaches it as a tool, `execute(name, input) → string`. A sandbox that dies comes back to Claude as a failed tool call, and `provision({resources})` makes a new one. A sandbox starts only when a tool needs one.

The first design put all three in one container. Losing it lost the session, a fault couldn't be traced to the harness, the network or the container, and the harness couldn't reach a customer's network without peering. Starting sandboxes only when needed cut the median time to first token by roughly 60% and the 95th percentile by over 90%.

- **Credentials never reach the sandbox.** A git token clones the repository when the sandbox starts and is wired into the remote, so the agent never handles it. MCP tokens stay in a vault, and Claude calls MCP tools through a proxy that adds them.
- **The log is a context store.** Compaction throws tokens away for good, so the harness can read positional slices of the log back when a later turn needs them.
- **Many brains, many hands.** More harnesses scale it out, a hand can be a container, a phone or an emulator, and brains can pass hands to one another.

## Compared with Shrimpy

| | Self-hosted Managed Agents | Shrimpy |
|---|---|---|
| What an agent is | A versioned config; the work happens in sessions, each with a sandbox | An identity with a [home](../REDESIGN/design/5-home.md) that lasts; a session sits behind each thread |
| Durable record | Each session's log, in Postgres | Pi's SQLite in each home, and threads on the chat server |
| Where the shell runs | A sandbox per session, apart from the loop | In the agent's own process; a sandbox, if any, wraps the whole agent |
| Keys | Kept out of the sandbox | In the home or the folder, inside any sandbox |
| When the center is down | No agent loop runs | Chat pauses, and agents keep working |
| Models | Claude **(I)** | Any provider Pi has, and model servers a person runs |
| Who it's for | An organization: sign-in, roles, one deployment per tenant | One person per gateway |

### Where they agree

- **Nothing inbound.** Workers poll and the server never connects to them, as Shrimpy's agents connect out to the gateway ([design 6](../REDESIGN/design/6-network.md)).
- **The record outlives crashes, and agents read it back.** The log lives outside anything that can crash, and [design 5](../REDESIGN/design/5-home.md)'s compaction row tells agents they can re-read the thread when a detail went missing.
- **Every step is on the record.** In Shrimpy the person finds every conversation and session of every agent from the clients, as [seeing work wherever it is](../REDESIGN/design/using-it.md) has it.

### Where they differ: the boundary

Managed Agents keeps the loop, the log and the secrets outside the sandbox. Shrimpy's confirmed [sandbox boundary](../REDESIGN/design/6-network.md) puts the whole agent process inside it, with its keys in the home or in the folder it is started in. Shrimpy's choice still fits Shrimpy **(I)**, for two reasons already in its design:

- **The home is the agent.** An agent edits its own context, skills and files with its own shell, so splitting the loop from the shell would split the agent from its home **(I)**. Managed Agents keeps what lasts between sessions in memory stores, and in self-hosted sandboxes each session's sandbox holds a copy.
- **A vault puts the secrets at the center, and every agent then needs the center to reach a model.** Design 5 looked at a sign-in kept at the gateway and dropped it for that reason, and [design 1](../REDESIGN/design/1-programs.md) promises that losing the gateway never stops an agent.

Their point lands on one thing. A sign-in is made once for a folder, and every agent started there can read it from its shell **(I)**. Design 6 already says that under one OS user the roster "stops accidents and not attacks". So Shrimpy's trust boundary is the OS user, the folder or the sandbox, which is where Managed Agents puts a separate deployment **(I)**. An agent that reads untrusted input belongs on the far side of that line, with a folder and sign-in of its own, or behind a proxy that injects its key, as Managed Agents' egress gateway does. Design 6 already accepts placeholder keys for that. It takes a line in a skill, not a mechanism.

## What Shrimpy could do with it

- **Build on it: no (I).** Besides the reasons above, it would tie Shrimpy to a download from Anthropic's account team, a bigger step than the Agent SDK package the coding-agents scout already asks about in [item 6](coding-agents-scout-2026-11-11.md#for-the-owner). Pi Durable already gives Shrimpy a durable runtime that someone else maintains.
- **Use it from an agent: maybe, later (I).** An agent with an API key and a skill could start a session with `ant`, send it a job and read its events. That puts it beside Codex and Claude Code in the coding-agents scout's question about delegated work, with the same gap: the agent looks idle and no Shrimpy client shows the job. Not before the release.
- **Borrow the split: only if it's ever wanted (I).** For an agent whose identity, home and keys stay put while only its shell runs somewhere disposable, the seam is the `ExecutionEnv` the host gives each session ([design 1](../REDESIGN/design/1-programs.md)), which Pi's built-in tools go through ([the Pi note](pi-agent.md#external-effects-and-execution-authority)). It would be a new decision beside the confirmed whole-process sandbox, not a change to it.

## For the owner

1. **Should the `shrimpy-agents` skill say where the trust line is?** One line: an agent that reads untrusted input runs apart, with a folder and sign-in of its own, or behind a proxy that injects its key. It is the only step here that touches what ships.

## Not checked

- [Differences from the hosted service](https://platform.claude.com/docs/en/managed-agents/self-hosted/differences): which hosted features self-hosting lacks.
- The price, and the license terms of the download.
- Whether Pi's `ExecutionEnv` can be served from another machine.

## Sources

Read on 2026-11-12:

- [Anthropic's announcement](https://claude.com/resources/articles/self-hosted-claude-managed-agents), 2026-11-12
- [Self-hosted Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/self-hosted), the docs' overview
- [Inference provider](https://platform.claude.com/docs/en/managed-agents/self-hosted/inference-provider)
- [Data and access in self-hosted Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/self-hosted-data-and-access)
- [Self-hosted sandboxes](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes)
- [Scaling Managed Agents: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents), Anthropic's engineering post, 2026-04-08

On Shrimpy's side: designs [1](../REDESIGN/design/1-programs.md), [5](../REDESIGN/design/5-home.md) and [6](../REDESIGN/design/6-network.md), [the Pi note](pi-agent.md) and the [coding-agents scout](coding-agents-scout-2026-11-11.md).
