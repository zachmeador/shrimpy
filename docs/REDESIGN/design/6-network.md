# 🦐 The network

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

An agent somewhere else joins the network and is reached through the gateway, with nothing inbound.

**The design**

Agents connect out to it and reconnect on their own, so they need no inbound listener. A program joins over a connection it keeps open, and counts as reachable for as long as that connection lasts. Joining carries Shrimpy's version, which is how a mismatch between peers gets reported. A connection made by name goes through the gateway, on one machine as well as across machines, so there is one path and it is used every day; a browser comes in through the gateway's WebSocket entry. The gateway gives the client a ticket for the program it asked for, and the program asks the gateway whose ticket it is. A program's own socket is used directly only by its home's path.

The agent process shares nothing with the outside except the network: no files, processes or `localhost`. Everything crosses the API. That keeps sandboxing a deployment choice, so the same agent runs natively, in a container, in a microVM or on another machine.

- **Entrypoint.** Shrimpy ships a foreground command that runs one agent until told to stop. A container, a VM's init, launchd or systemd can supervise it. The service installers are conveniences for running without a sandbox.
- **Network.** A sandboxed agent needs outbound access to the gateway and its model providers, including their login endpoints; Shrimpy assumes the sandbox allows provider traffic. It also needs whatever its work needs, such as git hosts or package registries. It needs nothing inbound. Egress beyond Shrimpy's own is each agent's policy. The gateway's authorization, not the firewall, limits who an agent can message.
- **Credentials.** Keys live in the home or in the folder it is started in, which puts them inside the sandbox. Sandboxes that inject keys through a proxy also work, because provider endpoints and keys stay plain configuration and placeholder keys are accepted.
- **Easy-to-miss grants.** A model server on the host needs one, because `localhost` inside a sandbox is the sandbox. So does Tailscale's `100.64.0.0/10` range, which Microsandbox blocks by default.
- **Cleanup.** Stopping a VM or container stops every process the agent started, which native mode can't promise.
- **Local attachment.** A Unix socket works when the client shares the machine. A sandboxed agent is reached through the gateway or a socket the sandbox forwards.
- **Administration.** An agent with the admin role reaches its neighbors over SSH to the machine that hosts them, then edits their homes directly or through the sandbox's own exec or mount. The sandbox itself still accepts nothing inbound.
- **Shared configuration.** A shared read-only config referenced by path needs a mount or a copy inside the sandbox.

The [sandbox runtime scout](../../research/sandbox-runtime-scout-2026-08-26.md) compares candidate sandboxes.

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Sandbox boundary | Agents aren't sandboxed | The whole agent process runs inside whatever sandbox or VM you pick, or none ([how](6-network.md)). No per-tool sandboxing; `bash` stays available. | Confirmed |
| Attachments | Telegram photos and clipboard images are paths on the same machine | Attachments travel with their message. The chat server keeps them with the thread, and each is copied into an agent's home, up to a size limit, when the message is offered; the agent's tools use them from there. | Confirmed |
| Home edits | The CLI edits workspace files directly | Homes live where their agent runs, and edits happen there: by the agent itself, by `shrimpy` run in that environment, or by an agent with the admin role over SSH to the machine hosting it. Remote clients get session operations and reload, not file editing. | Confirmed |
| Provider login | A browser callback on the same machine | Pi's login flows already handle a browser on another machine: they show a URL or device code and accept a pasted code or redirect URL. You run `shrimpy providers login` where the agents are, over a shell there, and it signs in the folder for every agent started in it, as [providers](5-home.md) has it. Nothing is relayed through an agent. Sandboxes allow provider traffic, including login endpoints. | Confirmed, and changed on 2026-10-06 |

**Open**

Another machine, sandboxes, Linux and Tailscale are under Not built yet below.

**Not built yet**

*The network: from another machine.*

Under Later in the [order of work](../PLAN.md#order-of-work).

**Outcome:** one command starts Shrimpy on this machine. You open the terminal, browse the agents that have joined your Shrimpy network, see their sessions, and talk to any of them in threads. You watch an agent's work, stop it, close the terminal, kill the agent and come back to an honest account of what happened. An agent on another machine joins the same network and looks the same in the terminal.

**From another machine, last.** These wait until there's a VM on the LAN to test them on. Nothing built before them assumes one machine: every link between programs takes a transport, so the same code runs over a Unix socket or a network connection.

- Joining the network: an agent authenticates to the gateway when it registers. On the gateway's own machine the socket's permissions are the check. From another machine the agent presents a token the gateway issued for it.
- The gateway's network entry: it listens on an address you choose for agents and clients on other machines, and asks for a token.
- Routing to an agent that only connects out: when a client asks for that agent, the gateway has the agent open one more connection and joins the two. A client then reaches a remote agent's sessions exactly as it reaches a local one, and the agent still needs no inbound listener.

**Prove**

- An agent started on another machine, or in a container with no shared files, joins with its token, shows up in the terminal, answers in a thread, and has its session watched and stopped from here.
- An agent with a missing or wrong token is refused, and a version that differs from the gateway's is reported.

*The network: agents everywhere.*

Under Later in the [order of work](../PLAN.md#order-of-work).

**Outcome:** agents run in sandboxes and on Linux, people's devices are identified by Tailscale, and chat reaches Telegram through the provider interface. Joining from another machine and reaching an agent's sessions through the gateway are already in the MVP.

**Build**

- Telegram as the first provider, reusing the existing sender, formatting and media helpers, without `AppRuntime`, `SessionPool` or the control bus. One poller per bot account, and an explicit owner for cursors, batches and receipts.
- Gateway registration and routing, with agents connecting out to it.
- Tailscale identity for people, and the gateway checking that an agent's token comes from the expected machine.
- The programs and their locks qualified on Linux.

**Prove**

- An agent in a separate process from the gateway, with terminal and web attaching through it using the same contract as local use.
- Switching agents and sessions; allowed and denied access; agent, gateway and client disconnects and reconnects; fixed-target retry; completion against the agent's filesystem; moving an attachment.
- A gateway or chat server failure leaves accepted work with the agent; clients recover from committed state, and agents catch up on channel messages they missed.
- The same agent inside one real sandbox or VM, with the client outside and no shared files.
- A sandboxed agent whose only outbound access is the gateway and its model provider.
- A message typed in the console in a Telegram-bridged channel appears in Telegram, posted by the bot and labelled with your name.
- Through Telegram: a reset between admission and retry, duplicate and batched updates, offline periods, first start, late replies, long formatted output, quiet notices, photos, documents, voice notes and video, and a lost send acknowledgment.
