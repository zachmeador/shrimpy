# 🦐 The network

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

An agent somewhere else joins the network and is reached through the gateway, with nothing inbound.

**The design**

Agents connect out to it and reconnect on their own, so they need no inbound listener. A program joins over a connection it keeps open, and counts as reachable for as long as that connection lasts. Joining carries Shrimpy's version, which is how a mismatch between peers gets reported. A connection made by name goes through the gateway, on one machine as well as across machines, so there is one path and it is used every day; a browser comes in through the gateway's WebSocket entry. The gateway gives the client a ticket for the program it asked for, and the program asks the gateway whose ticket it is. A program's own socket is used directly only by its home's path.

The agent process shares nothing with the outside except the network: no files, processes or `localhost`. Everything crosses the API. That keeps sandboxing a deployment choice, so the same agent runs natively, in a container, in a microVM or on another machine.

**Beside the gateway, or apart from it.** The gateway's socket is in a directory that only the gateway's OS user can open, and a connection on it that doesn't sign in is taken for you. So the line that matters is that socket, and not the machine. An agent runs beside the gateway, as its OS user, or apart from it: as another user of the same machine, in a container or on another machine. An agent apart can't use the socket. It comes in over the gateway's entry, at an address, with its token.

An agent apart is also the first that the roster's roles hold for. One beside the gateway shares its OS user, so its shell can open the socket without signing in and be taken for you. The design accepts that: under one OS user the roster stops accidents and not attacks.

This is designed against the setup you described on 2026-10-06:

| In that setup | How |
|---|---|
| The gateway, the chat server and most agents on one server | `shrimpy up` starts them, each a process of its own, all as one OS user. |
| Agents on that server under OS users of their own | Apart. The gateway listens on a loopback address too. |
| Agents on other machines | Apart. The gateway listens on an address those machines reach. |
| You, at a machine that isn't the gateway's | Over SSH to the gateway's machine, until a machine of yours can come in. |

**Pairing.** On the gateway's machine, once:

```bash
shrimpy up --listen 100.101.102.103:7447
```

That opens the gateway on the address you name, which should be one that only your own machines reach, such as its tailnet address. The folder remembers it. `--listen` can be given more than once, and a loopback address is what lets in an agent under another user of the gateway's machine.

To let an agent in, make an invitation for it:

```bash
shrimpy members invite crab
```

A name that is taken is refused there and then. Otherwise it prints one line to run where the agent will live, with the agent's name, an address and a code. The code works once, for fifteen minutes, and for that name only. Where the agent will live, with Shrimpy at the same version, you sign the folder in if it isn't yet, paste the line and start the agent:

```bash
shrimpy providers login
shrimpy agent join shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD
shrimpy up
```

- `join` is about who is let in, and takes nothing else. It makes the home `crab` if the folder has none, with a name and no model. It makes the home's token, shows the gateway the name, the code and the token, and writes the gateway's address into the home. It says at once whether the gateway let the agent in, and whether the two versions differ.
- `up`, in a folder whose agents all belong to a gateway elsewhere, starts those agents and no gateway or chat server. So `shrimpy up` runs what lives on a machine, whichever machine it is.
- The agent takes its model from the folder it is started in, as any agent does, which [providers](5-home.md) has. A model is no business of the gateway's, so none is in the line you paste.

From then on the agent connects out to that address by itself, and comes back by itself after either side restarts. Nothing is opened where the agent lives. On the gateway's machine crab is in the terminal's list like any agent: you talk to it in a thread, and watch and stop its sessions.

By hand that is one line on the gateway's machine and two where the agent will live, after a sign-in that a folder needs once. An admin agent can do the rest for you: it makes the invitation, reaches the other machine over SSH, runs the join, and sets up whatever keeps the agent running there. The sign-in is yours, since it needs you at a browser. `members invite` is open to an admin agent, as `members promote` is.

**Underneath**

1. **The entry.** The gateway listens on each address you chose, with the WebSocket entry it already has for a browser: `/ws/gateway` for the gateway itself, and `/ws/<kind>/<name>` for a way through to a registered program. A connection there that shows an agent's token is that agent, and may do what the agent may on the gateway's machine. One that shows a code, with the name the code is for, may join. One that shows neither gets nothing, and is never taken for you, which only the gateway's own socket does. The one other thing that opens a path there is the ID of a call, which only the agent that was called is told. A connection that says it comes from a web page is refused.
2. **An invitation.** A person or an admin asks the gateway for one, for a name that nobody has. It is a code of eight characters from an alphabet with no look-alikes, written `K7Q2-9FXD`. It is kept in memory as a ticket is, so a gateway that restarts forgets it. The link, `shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD`, is the name, the address and the code.
3. **Joining.** The home makes its token and keeps it first, as it does beside the gateway. The gateway keeps a hash of the token and never the token, and a home that never heard the answer asks again with the same token and is the same member. The home keeps the gateway's address beside its token.
4. **A way through.** A program, such as chat, is reached over the entry only with a ticket for it in hand. The gateway looks at the ticket before it opens the way, and the program then spends it. So nobody who hasn't signed in reaches a program.
5. **Reaching an agent that only connects out.** An agent apart registers with no socket. When someone asks for it, the gateway tells the agent, over the connection the agent keeps open, and the agent opens one more connection to the gateway, which joins the two. The agent asks "who wants me" and waits, as it asks chat for events, so the gateway never has to reach it.
6. **A dead connection.** The gateway pings each connection that comes over the entry and lets one go that stays silent for half a minute, so an agent that lost its network can register again. A registration lasts as long as its connection, which a dead network connection can outlive.
7. **Chat.** The chat server stays on the gateway's machine. An agent apart reaches it by name through the gateway, as an agent beside the gateway does.

**Tailscale.** It is never needed, and it should fit like a glove: your rule of 2026-10-06. Everything here works on any network your machines share, with an invitation as the way in, and each thing Tailscale adds is one you could do without.

- **Uses.** A private, encrypted network between your machines, with addresses and names that stay put, and a policy that says which machine may reach which port. None of that needs a line of Shrimpy's code: the gateway listens on an address and an agent connects to one.
- **May read, later.** A program can ask the Tailscale daemon on its own machine who is at the other end of a connection: which device, and which user or tags own it. The gateway could read that to recognize a machine of yours, or to check that an agent connects from the machine it is expected from. Tailscale's policy can also carry permissions for an application, which Shrimpy could read as who is an admin. Each of these saves a step and replaces nothing: the invitation and the token work without it.
- **Never manages.** Making auth keys, tagging devices, editing the policy and bringing a machine onto the tailnet are Tailscale's own business, done in its console or with its command. Doing them from Shrimpy would mean holding a key to your Tailscale account, redoing what its tools already do, and tying Shrimpy to one network.
- **Never served through it.** Shrimpy serves its own entry. It doesn't count on Tailscale Serve, or on any proxy, being in front of the gateway.
- **Between them, a skill.** An agent with a shell can run `tailscale status` and `tailscale ip`, and walk you through adding a machine. With Tailscale SSH, an admin agent reaches the machines it looks after with no keys to hand out. That is instructions, not a mechanism.

**Sandboxes**

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
| Letting an agent in | Only a program that can open the gateway's socket joins | By an invitation made on the gateway's machine and pasted where the agent will live. The other way round, a new machine asking and you approving it, would need the gateway open to strangers first. | Confirmed on 2026-10-06 |
| Tailscale | — | Never needed. Shrimpy uses a network that Tailscale provides, may later read from it who is at the other end, never manages it and is never served through it. | Confirmed on 2026-10-06 |
| Encryption | — | None of Shrimpy's own for now. On a tailnet the link is encrypted already. On a network that isn't one, a token and the messages travel in the clear, so the address you listen on should be one only your machines reach. | Confirmed for now on 2026-10-06 |
| The commands for it | — | `members invite` and `agent join`, one option, `--listen`, and `shrimpy up` starting only the agents in a folder whose agents all belong to a gateway elsewhere. | Confirmed on 2026-10-06: you agreed to the pairing they carry out, and to the change to `up` |
| You, from another machine | Over SSH to the gateway's machine | A machine of yours comes in by an invitation, as an agent does. It keeps a token in its Shrimpy folder and is you from then on. A Tailscale login may stand in for the token later. | Confirmed on 2026-10-06, as long as it is simple and clean. You saw its lines on 2026-10-07, and they are yours to change |

**Open**

- **How a person gets their name.** A person is named for the OS account that runs the gateway. When that account was made for Shrimpy, the name is wrong and can be the one an agent wants: see [status](../STATUS.md). The design has the name you appear under as a setting of your own, for later, and moving in made it now.

**Not built yet**

*An agent apart from the gateway.*

Under Now in the [order of work](../PLAN.md#order-of-work).

**Outcome:** an agent that runs as another OS user, in a container or on another machine joins the same network with one pasted line and looks the same in the terminal: you talk to it in a thread, and watch and stop its sessions.

**Build,** in four steps, each tested on one machine over a real connection first:

1. **Letting an agent in.** The entry on an address, the invitation, and a home that remembers its gateway. An agent in a folder that shares no sockets with the gateway joins, is listed as running, reads chat and answers in a thread. Built: underneath on 2026-10-06, and its commands on 2026-10-07, each a change of its own.
2. **Reached through the gateway.** The gateway joining a client to an agent that connects out, so that the terminal watches and stops that agent's sessions as it does those of an agent beside the gateway. Built on 2026-10-07.
3. **Kept honest.** Pings, coming back after either side restarts, a wrong or missing token refused, a version that differs reported. Built on 2026-10-07. Then the same with an agent under a second OS user, and over an address a second machine reaches directly.
4. **You, from another machine.** The terminal on a machine that isn't the gateway's, let in by an invitation of its own. Built on 2026-10-07, as below.

**The first step, underneath.** What was built first has no command. It is reached from code, and each command comes after as a change of its own.

- **Where the gateway listens.** It is started with the addresses to listen on, each a host and a port, and says which it got. No files are served there.
- **Who a connection is.** A connection over the entry is apart from the gateway. Until it signs in or joins it may do only those two things. Once it has, it is that agent, and may list what is running and who is on the roster, ask for tickets, register, and promote or demote if it is an admin. It is never the person who runs the gateway.
- **An invitation.** It is good once and for fifteen minutes. The answer has the code and the addresses the gateway listens on, and with none it is refused: nobody could use it.
- **The link.** One function writes it and one reads it, for the command that prints it and the one that takes it.
- **Being there.** An agent apart signs in and registers with no socket, so the roster says it is running and a copy of its home is turned away.
- **A way through.** The way to a program takes the ticket as well as the name.

**The commands of the first step,** as they were built.

- **`--listen <host:port>`** on `shrimpy up` and `shrimpy gateway serve`, given more than once for more addresses. The gateway keeps them with its roster, so a later start with no `--listen` listens there again, and says so. Giving them again replaces what was kept. An address that means every interface is refused, since an invitation needs one that another machine can use.
- **`shrimpy up` that is told to listen** starts the gateway and the chat server in a folder with no agents too, since agents elsewhere can join it.
- **`shrimpy members invite <name>`** prints the line to paste, one for each address the gateway listens on, and says which is for another user of the gateway's machine.
- **`shrimpy agent join <link>`** makes the home in the Shrimpy folder if there is none, joins, and gives up on a gateway that doesn't answer within a quarter of a minute.
- **`shrimpy up` where there is no gateway.** When every agent it is to start belongs to a gateway elsewhere, it starts those agents and no gateway or chat server, unless it is told to listen.

**The second step, underneath,** as it was built. A client reaches an agent apart by its name, as it reaches one beside the gateway, and neither it nor the agent's own server can tell the difference.

- **A call.** When a client asks for an agent that registered with no socket, the gateway makes a call for it: an ID that nobody could guess, good once and for a quarter of a minute. The client's connection waits at the gateway.
- **Who wants me.** The agent asks the gateway for its calls over the connection it registered on, and waits for the answer, as it waits on chat's feed. Only the connection that registered as the agent is told of its calls.
- **Answering.** For each call the agent opens one more connection to the entry, at a path that carries the call's ID, and joins it to its own socket on its own machine, the one its server already serves for connections that come through the gateway. The gateway joins that connection to the client's. From then on bytes pass both ways, and the gateway reads none of them.
- **The ticket.** A client gets a ticket for an agent apart as for any program, hands it over first, and the agent asks the gateway whose it is over its own connection. So the agent's server and its rules for who may do what are untouched.
- **From either side.** The way in on the gateway's machine and the way through over the entry both make a call for an agent apart, so a client beside the gateway and a client apart from it reach the agent the same way.
- **No answer.** A call that the agent doesn't answer in time ends the client's connection, which a client already shows as an agent it couldn't reach.

**The third step, underneath,** as it was built. What keeps an agent apart and its gateway honest about each other.

- **A connection that went dead at the gateway.** The entry pings every connection it holds, and lets go of one that hasn't answered for half a minute. A registration goes with its connection, so an agent that lost its network without a word stops being listed, and can register again when it is back.
- **A gateway that went dead at the agent.** An agent apart asks its gateway something small every quarter of a minute, and takes no answer within a quarter of a minute for a lost connection: it lets go and connects again, as it does when the connection closes.
- **What the agent says.** One line when it loses its gateway, with the address and that it keeps trying, and one line when it is back. Nothing in between, however long it takes.
- **Another version.** An agent apart that finds its gateway running another version of Shrimpy says so once, with both versions, and carries on: programs are upgraded together, and nothing is refused for a version.
- **A token the gateway doesn't know.** An agent apart is told to delete its membership and join again with a new invitation, since only an invitation lets it in.
- **An agent that isn't running.** On the gateway's machine, a command that finds an agent on the roster with no home in its folder says to start it where it lives, and no longer names a command that can't work there.
- **A stop always ends.** A program reaches the entry with a transport that can drop a connection at once, so an agent apart that is told to stop ends whatever the network is doing, and says nothing. A page in a browser has only the platform's WebSocket, which waits for a closing that a dead end never gives, and the entry takes no page.
- **A limit on connecting.** Each try at connecting, signing in and registering gives up after a quarter of a minute, so an agent that starts while its gateway takes connections and answers nothing says so within that time.
- **Chat follows the gateway.** When an agent loses its gateway it lets go of its connection to chat too, and comes in again with a new ticket once it has registered again, so it never waits on a feed that can't arrive.

**The fourth step: you, from another machine.** You agreed to it on 2026-10-06 as long as it was simple and clean, and saw these lines on 2026-10-07. You haven't said yes or no to them: it was built that day as shown, for you to change.

```text
$ shrimpy members invite
The invitation works once, for fifteen minutes, and lets another machine of yours in as zachmeador. Run this there:
  shrimpy join shrimpy://100.101.102.103:7447/K7Q2-9FXD
```

```text
$ shrimpy join shrimpy://100.101.102.103:7447/K7Q2-9FXD
This machine is zachmeador's now, on the gateway at 100.101.102.103:7447.
Open the terminal with: shrimpy
```

- **The invitation.** `shrimpy members invite` with no name is for a machine of your own. Only you can ask for it: on the gateway's machine, or from a machine of yours that is in already. No agent can, admin or not, since it would let the agent in as you. Its link carries no name.
- **Joining.** `shrimpy join <link>` makes a token, keeps it in the Shrimpy folder of that machine, and shows the gateway the code and the token. The gateway keeps a hash of the token with your record, beside how it knows you on its own machine. A machine that never heard the answer shows the same link again and is let in.
- **From then on** a connection over the entry that shows that token is you, with everything you may do. A command in that folder that is not in an agent's shell reaches the gateway there as you: the terminal, `run`, `threads`, `read`, `rooms`, `members` and the rest that talk. A command about an agent's home acts on the homes of the machine it runs on, as it does everywhere.
- **A folder that has a gateway of its own** is not joined: you are you there already, and `shrimpy join` says so.
- **Leaving** is deleting the file the token is kept in. Nothing yet takes a machine's token back at the gateway.

**A service.** You asked on 2026-10-07 for `shrimpy gateway install` and `shrimpy gateway uninstall`, after the first setup on your Linux machine was kept running by a unit written by hand. Built that day.

- **`shrimpy gateway install`** sets up a service for the account that runs it, which runs `shrimpy up` for the Shrimpy folder, and starts it: a systemd user unit on Linux, a LaunchAgent on a Mac. The service starts again when it fails. On any other system the command says what to run under whatever keeps programs running there.
- **One folder has one service.** The default folder's is called `shrimpy`. Any other folder's has a name made from the folder, and is told the folder.
- **What it runs** is what `up` would start there, and the command says which: the gateway, the chat server and the agents, or only the agents on a machine whose agents all belong to a gateway elsewhere. It runs the Shrimpy that installed it, with the `PATH` of the shell that installed it, so an agent's shell finds what yours does. Since `up` keeps its folder running, an agent made later starts within a few seconds, and one that ends is started again, with nothing restarted.
- **A stop** is sent to `up` alone, which stops the agents, then the chat server, then the gateway, as it does at Ctrl+C. It has half a minute.
- **Lingering.** On Linux a user service stops when the account's last login ends, unless the account lingers. `install` turns lingering on, and when that takes an administrator it installs and starts the service all the same and prints the one command that does.
- **Run again,** it writes the service again and restarts it. It is refused while `shrimpy up` runs for the folder by hand, since the service would find everything running and start nothing, and where there is nothing for a service to start.
- **`shrimpy gateway uninstall`** stops the service and removes it. It leaves every folder and file of Shrimpy's as it is, and lingering too.
- **`shrimpy gateway status`** ends with a line that says whether a service is installed for the folder, and whether it is running, with or without a gateway. On a machine whose agents all belong to a gateway elsewhere it says where that gateway is, and doesn't say to start one.

**Linux.** The tests ran there for the first time on 2026-10-07, on a machine of yours: Ubuntu 24.04 on x86_64 with Node 22.23. Of 613, 603 passed and 7 were skipped, and of the 661 there were by the end of that day, 651: the six that call a real model and one that needs an IPv6 loopback, which that machine has none of. The other three bundle a contract for a browser and failed because the dependencies were copied from a Mac and not installed there, so the bundler's Linux binary was missing. Two things were found and fixed: Node 22 warned that SQLite is experimental at the start of every program, and a test let go of a lock it meant to hold. Since then a pairing with a second machine has run there, and so have the programs kept running by services that `shrimpy gateway install` set up, for the account with the gateway and for one whose agent belongs to it. One thing to look at: the runtime directory is `$XDG_RUNTIME_DIR/shrimpy` where that variable is set and `/tmp/shrimpy-<uid>` where it isn't, so a gateway started by a service and a command typed in a shell may not look in the same place. On your machine a service and a command typed over SSH looked in the same place.

**Left for later**

- **Commands about one agent, from elsewhere.** `sessions`, `triggers`, `agent reload` and the like find an agent by its home's folder and talk to it by that path, so they act on an agent only where its home is, and as its OS user. The terminal reaches an agent by its name through the gateway, so after the second step it lists, watches and stops an agent wherever it lives. Naming an agent by its roster name in a command is a change of its own.
- **The chat server on a machine other than the gateway's.**

**Prove**

- An agent started under another OS user, in a container with no shared files, or on another machine joins with its invitation, shows up in the terminal, answers in a thread, and has its session watched and stopped from the gateway's machine.
- An agent with a missing or wrong token is refused, and a version that differs from the gateway's is reported.

*The network: agents everywhere.*

Under Later in the [order of work](../PLAN.md#order-of-work).

**Outcome:** agents run in sandboxes and on Linux, the gateway reads who is at the other end from Tailscale where it is there, and chat reaches Telegram through the provider interface.

**Build**

- Telegram as the first provider, reusing the existing sender, formatting and media helpers, without `AppRuntime`, `SessionPool` or the control bus. One poller per bot account, and an explicit owner for cursors, batches and receipts.
- Reading from Tailscale where it is there, and never needing it: whose a person's machine is, and whether an agent connects from the machine it is expected from.
- The tests run on Linux with dependencies installed on the machine.

**Prove**

- An agent in a separate process from the gateway, with terminal and web attaching through it using the same contract as local use.
- Switching agents and sessions; allowed and denied access; agent, gateway and client disconnects and reconnects; fixed-target retry; completion against the agent's filesystem; moving an attachment.
- A gateway or chat server failure leaves accepted work with the agent; clients recover from committed state, and agents catch up on channel messages they missed.
- The same agent inside one real sandbox or VM, with the client outside and no shared files.
- A sandboxed agent whose only outbound access is the gateway and its model provider.
- A message typed in the console in a Telegram-bridged channel appears in Telegram, posted by the bot and labelled with your name.
- Through Telegram: a reset between admission and retry, duplicate and batched updates, offline periods, first start, late replies, long formatted output, quiet notices, photos, documents, voice notes and video, and a lost send acknowledgment.
