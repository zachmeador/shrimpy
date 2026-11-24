# 🦐 The network

This is one piece of the design. The words for a decision's status, such as Confirmed or Open, are explained in the [plan](../PLAN.md#the-design).

An agent somewhere else joins the network and is reached through the gateway, with nothing inbound.

**The design**

Every program connects out to the gateway and reconnects on its own, so none needs an inbound listener. A program keeps one link to the gateway open, and counts as reachable for as long as that link lasts. The gateway is Chord's relay: a request for a program's object travels over that program's link, stamped with who is asking, and the program believes the stamp because it arrives on its link from the gateway. Connecting compares the exact set of Pi packages, and a mismatch is refused, as [the contracts](2-contracts.md) have it. A connection made by name goes through the gateway, on one machine as well as across machines, so there is one path and it is used every day. A browser comes in with the web client. A program's own socket is used directly only by its home's path, as you.

The agent process shares nothing with the outside except the network: no files, processes or `localhost`. Everything crosses the API. That keeps sandboxing a deployment choice, so the same agent runs natively, in a container, in a microVM or on another machine.

**Beside the gateway, or apart from it.** The gateway's socket is in a directory that only the gateway's OS user can open, and a connection on it that doesn't sign in is taken for you. So the line that matters is that socket, and not the machine. An agent runs beside the gateway, as its OS user, or apart from it: as another user of the same machine, in a container or on another machine. An agent apart can't use the socket. It comes in over the gateway's entry, at an address, with its token.

An agent apart is also the first that the roster's roles hold for. One beside the gateway runs under your account, so its shell can open the socket without signing in and be taken for you. That is where trust ends, as [identity](3-identity.md) has it: an account is yours or an agent's, and whatever runs under yours can do anything you can.

This is designed against the setup you described on 2026-10-06:

| In that setup | How |
|---|---|
| The gateway, the chat server and most agents on one server | `shrimpy up` starts them, each a process of its own, all as one OS user. |
| Agents on that server under OS users of their own | Apart. The gateway listens on a loopback address too. |
| Agents on other machines | Apart. The gateway listens on an address those machines reach. |
| You, at a machine that isn't the gateway's | As a device of yours, let in by an invitation. |

**Pairing.** On the gateway's machine, once:

```bash
shrimpy up --listen 100.101.102.103:7447
```

That opens the gateway on the address you name, which should be one that only your own machines reach, such as its tailnet address. The folder remembers it. `--listen` can be given more than once, and a loopback address is what lets in an agent under another user of the gateway's machine.

To let an agent in, make an invitation for it:

```bash
shrimpy invite crab
```

Your own name is refused there and then. For a vacant name, or an agent that is already on the roster, it prints one line to run where the agent will live: it installs Shrimpy at the gateway's version, as [using it](using-it.md) has installing, then joins with the agent's name, an address and a code. The code works once, for fifteen minutes, and for that name only. Where the agent will live, you sign the folder in if it isn't yet, paste the line and start the agent:

```bash
shrimpy login
shrimpy join shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD/ocKmkNBacmPG6VxrlnuW3Q
shrimpy up
```

- `join` is about who is let in, and takes nothing else. It makes the home `crab` if the folder has none, with a name and no model, or re-joins an existing home for that agent. It makes a token (leaving any existing membership intact while trying), checks the gateway's key against the link's fingerprint, shows the gateway the name, the code and the token, and writes the token, member ID, roster ID, gateway address and fingerprint into the home. For an existing agent, the gateway replaces its token on the same roster entry, revoking the old way and dropping any live link. It says at once whether the gateway let the agent in, and whether the two versions differ.
- `up`, in a folder whose agents all belong to a gateway elsewhere, starts those agents and no gateway or chat server. So `shrimpy up` runs what lives on a machine, whichever machine it is.
- The agent takes its model from the folder it is started in, as any agent does, which [providers](5-home.md) has. A model is no business of the gateway's, so none is in the line you paste.

From then on the agent connects out to that address by itself, and comes back by itself after either side restarts. Nothing is opened where the agent lives. On the gateway's machine crab is in the terminal's list like any agent: you talk to it in a thread, and watch and stop its sessions.

By hand that is one line on the gateway's machine and two where the agent will live, after a sign-in that a folder needs once. An admin agent can do the rest for you: it makes the invitation, reaches the other machine over SSH, runs the line, and sets up whatever keeps the agent running there. Without SSH, a coding agent you open there runs the line instead. The sign-in is yours, since it needs you at a browser. `invite` is open to an admin agent, as `members promote` is.

**Underneath**

1. **The entry.** The gateway listens on each address you chose, over WebSocket inside TLS, as the next paragraph has it. A connection there that shows an agent's token is that agent, and may do what the agent may on the gateway's machine. One that shows the token of a device of yours is you. One that shows a code, with what the code is for, may join. One that shows neither gets nothing: only the gateway's own socket takes a connection that shows no token for you. A connection that says it comes from a web page is refused.
2. **An invitation.** You or an admin agent asks the gateway for one for an agent—either a vacant name or an existing agent on the roster—and only you ask for one for a device. It is a code of eight characters from an alphabet with no look-alikes, written `K7Q2-9FXD`. It is kept in memory, so a gateway that restarts forgets it. The link, `shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD/ocKmkNBacmPG6VxrlnuW3Q`, is the name, the address, the code and the fingerprint of the gateway's key.
3. **Joining.** The home makes its token and keeps it first, as it does beside the gateway (or under `joining` when re-joining an existing home so a failed attempt never disturbs the old membership). The gateway keeps a hash of the token and never the token, and a home that never heard the answer asks again with the same token and is the same member. The home keeps the member ID, the roster ID, the gateway's address and the key's fingerprint beside its token.
4. **Routing.** A client's request names the object it wants, and the object's address names its program: an agent by its member ID (`agent({ id })`), or the chat server (`chat()`). The gateway routes the request by that address over the program's link, stamped with who is asking, and never reads the contract. A request for a program that is away waits, and binds when the program is back.
5. **One link for each program.** An agent apart and one beside the gateway both connect out, so no program is dialed and the gateway never has to reach one. The link carries the program's own requests up and every request for it down.
6. **A dead link.** Chord pings a link that has been silent for 15 seconds and closes one that stays silent, so a program that lost its network comes back on a new link.
7. **Chat.** The chat server stays on the gateway's machine. An agent apart reaches it by name through the gateway, as an agent beside the gateway does.

**The gateway proves itself.** A member that comes in over the entry checks that the gateway is yours, and nothing crosses the network in the clear. The gateway makes a key when it first makes its data. An invitation's link carries the key's fingerprint, the member keeps it beside its token, and every connection over the entry is encrypted and checked against it, so a gateway that isn't yours learns no token. Shrimpy's own clients and agents check it this way. A browser can't check a fingerprint and needs a certificate it trusts, which is under Not built yet below. It matters more with the relay, since a program believes whatever its link from the gateway stamps on a request. You decided this on 2026-11-14 with the rest of [identity](3-identity.md), and it was built that day. The key is Ed25519, in the gateway's `state/key.pem`, and its fingerprint is the first 16 bytes of the SHA-256 of its public key: 22 characters at the end of the link. The entry speaks TLS 1.3, around a certificate made from the key each time, and a member checks the key the moment the handshake ends, so its hello, which carries its token, goes only to your gateway.
**Tailscale.** It is never needed, and it should fit like a glove: your rule of 2026-10-06. Everything here works on any network your machines share, with an invitation as the way in, and each thing Tailscale adds is one you could do without.

- **Uses.** A private, encrypted network between your machines, with addresses and names that stay put, and a policy that says which machine may reach which port. None of that needs a line of Shrimpy's code: the gateway listens on an address and an agent connects to one.
- **May read, later.** A program can ask the Tailscale daemon on its own machine who is at the other end of a connection: which device, and which user or tags own it. The gateway could read that to recognize a device of yours, or to check that an agent connects from the machine it is expected from. Tailscale's policy can also carry permissions for an application, which Shrimpy could read as who is an admin. Each of these saves a step and replaces nothing: the invitation and the token work without it.
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

A scout of sandbox runtimes on 2026-08-26 compared the candidates.

**Decisions**

| Topic | Today | Proposed | Decision |
|---|---|---|---|
| Sandbox boundary | Agents aren't sandboxed | The whole agent process runs inside whatever sandbox or VM you pick, or none ([how](6-network.md)). No per-tool sandboxing; `bash` stays available. | Confirmed |
| Attachments | Telegram photos and clipboard images are paths on the same machine | Attachments travel with their message. The chat server keeps them with the thread, and each is copied into an agent's home, up to a size limit, when the message is offered; the agent's tools use them from there. | Confirmed |
| Home edits | The CLI edits workspace files directly | Homes live where their agent runs, and edits happen there: by the agent itself, by `shrimpy` run in that environment, or by an agent with the admin role over SSH to the machine hosting it. Remote clients get session operations and reload, not file editing. | Confirmed |
| Provider login | A browser callback on the same machine | Pi's login flows already handle a browser on another machine: they show a URL or device code and accept a pasted code or redirect URL. You run `shrimpy login` where the agents are, over a shell there, or a coding agent setting up there runs it and passes you its link and what you paste back, as [using it](using-it.md) has it. It signs in the folder for every agent started in it, as [providers](5-home.md) has it. Sandboxes allow provider traffic, including login endpoints. | Confirmed, and changed on 2026-10-06. A coding agent passes it on since 2026-11-23 |
| An agent behind its gateway | It is turned away, and keeps trying, until someone updates its machine | After a release that changes the Pi packages or the major, the gateway turns away an agent still on the old release, so nothing can reach it to ask it to update. Such an agent installs its gateway's version and restarts by itself, when that version is newer and the agent runs from an install. That covers a machine that was off during an update too. It never goes past the gateway's version, and is the one update nobody asks for. | Confirmed on 2026-11-23: "lgtm" |
| Letting an agent in | Only a program that can open the gateway's socket joins | By an invitation made on the gateway's machine and pasted where the agent will live. The other way round, a new machine asking and you approving it, would need the gateway open to strangers first. | Confirmed on 2026-10-06 |
| Tailscale | — | Never needed. Shrimpy uses a network that Tailscale provides, may later read from it who is at the other end, never manages it and is never served through it. | Confirmed on 2026-10-06 |
| Encryption | — | The gateway makes a key with its data, an invitation carries the key's fingerprint, and every connection over the entry is encrypted and checked against it. A browser checks a certificate it trusts instead. | Changed on 2026-11-14, from none of Shrimpy's own, which was confirmed for now on 2026-10-06, and built that day |
| The gateway as Chord's relay | The gateway pipes bytes between a client and a program, a ticket says who the client is, an agent apart opens a connection for each call, and Shrimpy pings each connection | Every program connects out to the gateway, which routes each request by address over that program's link, stamped with who is asking. Tickets, pipes, calls and Shrimpy's pings go, and the gateway's key comes with it. It is built straight on the latest Pi. If routing to a program over the link it opened doesn't hold up, the fallback is Chord end to end over today's pipes, with tickets kept. | Confirmed on 2026-11-14: "decision 1 i trust your judgement on", and with no proof first: "my dude we're just going straight to latest pi". Built on 2026-11-14 |
| The commands for it | — | `invite` and `join`, one option, `--listen`, and `shrimpy up` starting only the agents in a folder whose agents all belong to a gateway elsewhere. | Confirmed on 2026-10-06: you agreed to the pairing they carry out, and to the change to `up` |
| You, from another machine | Over SSH to the gateway's machine | A machine of yours comes in as a device, by an invitation, as an agent does. It keeps a token in its Shrimpy folder and is you from then on, until you take the token back. A Tailscale login may stand in for the token later. | Confirmed on 2026-10-06, as long as it is simple and clean, and its lines kept on 2026-11-15: "sure" |

**Built**

*An agent apart from the gateway,* built in four steps. What is left of it is under Not built yet.

**Outcome:** an agent that runs as another OS user, in a container or on another machine joins the same network with one pasted line and looks the same in the terminal: you talk to it in a thread, and watch and stop its sessions.

**Build,** in four steps, each tested on one machine over a real connection first:

1. **Letting an agent in.** The entry on an address, the invitation, and a home that remembers its gateway. An agent in a folder that shares no sockets with the gateway joins, is listed as running, reads chat and answers in a thread. Built: underneath on 2026-10-06, and its commands on 2026-10-07, each a change of its own.
2. **Reached through the gateway.** The gateway joining a client to an agent that connects out, so that the terminal watches and stops that agent's sessions as it does those of an agent beside the gateway. Built on 2026-10-07.
3. **Kept honest.** Pings, coming back after either side restarts, a wrong or missing token refused, a version that differs reported. Built on 2026-10-07. Then the same with an agent under a second OS user, and over an address a second machine reaches directly.
4. **You, from another machine.** The terminal on a machine that isn't the gateway's, let in by an invitation of its own. Built on 2026-10-07, as below.

**The commands of the first step,** as they were built.

- **`--listen <host:port>`** on `shrimpy up` and `shrimpy gateway serve`, given more than once for more addresses. The gateway keeps them with its roster, so a later start with no `--listen` listens there again, and says so. Giving them again replaces what was kept. An address that means every interface is refused, since an invitation needs one that another machine can use.
- **`shrimpy up` that is told to listen** starts the gateway and the chat server in a folder with no agents too, since agents elsewhere can join it.
- **`shrimpy invite <name>`** prints the line to paste, one for each address the gateway listens on, and says which is for another user of the gateway's machine.
- **`shrimpy join <link>`** makes the home in the Shrimpy folder if there is none, joins, and gives up on a gateway that doesn't answer within a quarter of a minute.
- **`shrimpy up` where there is no gateway.** When every agent it is to start belongs to a gateway elsewhere, it starts those agents and no gateway or chat server, unless it is told to listen.

**Underneath, since the move to Pi 1.5.2.** The first three steps were built on 2026-10-06 and 2026-10-07 with tickets, calls the gateway made for an agent apart, and pings of Shrimpy's own. Chord's relay replaced those on 2026-11-14, and what holds now is this.

- **Who a connection is.** A connection over the entry is apart from the gateway. Until it shows a token or a code it gets nothing. One that shows an agent's token is that agent, and every request it makes is stamped as the agent.
- **An invitation.** It is good once and for fifteen minutes. The answer has the code, the addresses the gateway listens on and its key's fingerprint, and with no address it is refused: nobody could use it.
- **The link.** One function writes it and one reads it, for the command that prints it and the one that takes it.
- **Being there.** An agent apart links in at the entry with its token, so the roster says it is reachable, and a copy of its home is turned away while it runs.
- **Reached by ID.** A client looks up the agent's member ID on the roster and asks for it at `agent({ id })`, for an agent apart as for one beside the gateway, and the gateway routes the request over the agent's link. A request for an agent that is away waits, and binds when the agent is back. Since 2026-11-23 a command about one agent does the same for the name `--agent` gives, as [using it](using-it.md) has it.
- **What the agent says.** One line when it loses its gateway, with the address and that it keeps trying, and one line when it is back.
- **A token the gateway doesn't know.** An agent apart is told to get a new invitation and run `shrimpy join <link>` to replace its token. An agent beside the gateway is told to delete its membership so it makes a new token (or to move its home out if it was removed).
- **A stop always ends.** A link's socket is dropped the moment Chord closes it, so an agent apart that is told to stop ends whatever the network is doing.
- **Limits.** A dial waits a quarter of a minute for the gateway's answer, and Chord closes a link that stays silent for half a minute.
- **Chat follows the gateway.** An agent holds chat over its link to the gateway, so losing one loses both, and its marks of where it works are set again when it is back.

**The fourth step: you, from another machine,** built on 2026-10-07, and shown as it prints since the gateway has its key. You kept its lines as they are on 2026-11-15, and inviting a machine of yours moves into the terminal as `/devices invite`, as [using it](using-it.md) has it.

```text
$ shrimpy invite
The invitation works once, for fifteen minutes, and lets another machine of yours in as zachmeador. Run this there:
  shrimpy join shrimpy://100.101.102.103:7447/K7Q2-9FXD/ocKmkNBacmPG6VxrlnuW3Q
```

```text
$ shrimpy join shrimpy://100.101.102.103:7447/K7Q2-9FXD/ocKmkNBacmPG6VxrlnuW3Q
This machine is zachmeador's now, on the gateway at 100.101.102.103:7447.
Open the terminal with: shrimpy
```

- **The invitation.** `shrimpy invite` with no name is for a machine of your own. Only you can ask for it: on the gateway's machine, or from a machine of yours that is in already. No agent can, admin or not, since it would let the agent in as you. Its link carries no name.
- **Joining.** `shrimpy join <link>` makes a token, keeps it in the Shrimpy folder of that machine, and shows the gateway the code and the token. The gateway keeps a hash of the token with your entry on the roster. A machine that never heard the answer shows the same link again and is let in.
- **From then on** a connection over the entry that shows that token is you, with everything you may do. A command in that folder that is not in an agent's shell reaches the gateway there as you: the terminal, `run`, `threads`, `read`, `rooms`, `members`, `status` and the rest that talk, and a command about one agent named by its name. A command that reads or changes a home's files acts on the homes of the machine it runs on, as it does everywhere.
- **A folder that has a gateway of its own** is not joined: you are you there already, and `shrimpy join` says so.
- **Leaving** is deleting the file the token is kept in. `/devices take back` in the terminal ends the token at the gateway, and everything it holds open.

**A service.** You asked on 2026-10-07 for `shrimpy gateway install` and `shrimpy gateway uninstall`, after the first setup on your Linux machine was kept running by a unit written by hand. Built that day, and named `shrimpy install` and `shrimpy uninstall` since 2026-10-09, since what is installed runs `shrimpy up`, on a machine that may have no gateway.

- **`shrimpy install`** sets up a service for the account that runs it, which runs `shrimpy up` for the Shrimpy folder, and starts it: a systemd user unit on Linux, a LaunchAgent on a Mac. The service starts again when it fails. On any other system the command says what to run under whatever keeps programs running there.
- **One folder has one service.** The default folder's is called `shrimpy`. Any other folder's has a name made from the folder, and is told the folder.
- **What it runs** is what `up` would start there, and the command says which: the gateway, the chat server and the agents, or only the agents on a machine whose agents all belong to a gateway elsewhere. It runs the Shrimpy that installed it, with the `PATH` of the shell that installed it, so an agent's shell finds what yours does. Since `up` keeps its folder running, an agent made later starts within a few seconds, and one that ends is started again, with nothing restarted.
- **A stop** is sent to `up` alone, which stops the agents, then the chat server, then the gateway, as it does at Ctrl+C. It has half a minute.
- **Lingering.** On Linux a user service stops when the account's last login ends, unless the account lingers. `install` turns lingering on, and when that takes an administrator it installs and starts the service all the same and prints the one command that does.
- **Run again,** it writes the service again and restarts it. It is refused while `shrimpy up` runs for the folder by hand, since the service would find everything running and start nothing, and where there is nothing for a service to start.
- **`shrimpy uninstall`** stops the service and removes it. It leaves every folder and file of Shrimpy's as it is, and lingering too.
- **`shrimpy status`** ends with a line that says whether a service is installed for the folder, and whether it is running, with or without a gateway. On a machine whose agents all belong to a gateway elsewhere it says where that gateway is, and doesn't say to start one.

**You, from a browser,** decided and built on 2026-11-21, with the web client: "i think this makes sense". The gateway serves the web client's page itself, at a door of its own beside the entry, and a browser comes in as a device of yours with a token of its own, as a machine does. Nothing stands in front of the gateway: no proxy, and no Tailscale Serve. The entry is as it was, and goes on turning web pages away.

- **Where the door is.** With nothing set it listens on the machine's own loopback address at port 7448, over plain HTTP, since a browser takes `localhost` as safe. The address stays the same from start to start, because an installed page, its cookie and a push subscription all hang on it. `settings.json` can give it another address under `page`, and a certificate's file and key. Off loopback it serves only over HTTPS. The settings are read when the gateway starts, so a renewed certificate needs a restart. A setting that can't be used, or a port that is taken, keeps the door shut and is said, and the gateway starts all the same.
- **Getting in.** An invitation for a device carries the door's address, and `shrimpy invite` prints a link to open in a browser, with the code after the `#` so that it reaches no server's log. The page shows the code to the door once. The door makes the browser's token and keeps it in a cookie the page's scripts can't read, sent only with the link, for 400 days. `/devices` and taking a device back work for it as for any device.
- **The link.** The door takes a link only from its own page, by where the request says it comes from, and knows the device by its cookie. It is a WebSocket carrying Shrimpy's hello and then Chord, as the entry's is.
- **Where a browser is told things.** At `/link/push` the door tells anyone the gateway's push key, which a browser subscribes with, and takes a browser's subscription in place of any it had. It takes one only from a browser that is let in, which it knows by its cookie, and only from its own page. A place goes when its device is taken back, or when its push service says it is gone, as it does after a browser unsubscribes. What is sent there is in [the conversation model](4-conversation.md).
- **HTTPS** comes from certificate files the gateway is pointed at. On a tailnet `tailscale cert` makes them. On a plain LAN you make a certificate of your own and have your browser trust it, and some setups will be just that. A skill has an agent walk you through either: "agents are very good at helping users get stuff like that working".
- **The page's addresses.** The page's address follows what is open on it, so the door serves the page's document at any address that is no file of the page's. Its link and its join are the door's own, and no address under them is the page's.
- **What the page may fetch.** The document carries a Content-Security-Policy that holds the page to its own gateway and its own script: `default-src 'self'`, with pictures also from `data:`, for the ones a home's files hold. The face's files come from the door too, so a page asks no other server for anything. The policy is a choice of the build, and yours to strike. The door serves every file to be fetched afresh each time, about 800 KB in all.
- **Tried** in a Chromium browser on 2026-11-21 and 22, on the gateway's own machine: the page got in by an invitation's link, its cookie stayed out of its scripts' reach, it kept its link through a gateway that went away and came back, and the policy refused nothing the page needs. On 2026-11-22 the door went onto a tailnet with a certificate that `tailscale cert` made, and the page was installed on your iPhone from there and worked. A browser's subscription, Firefox, and Safari on a desktop are untried.

**Not built yet**

*What is left of a browser's way in.* The certificate's skill, an invitation as a code to scan, and renewing a browser's cookie before its 400 days are up. A page that isn't let in has no field that takes a code. An app on a phone's home screen keeps storage of its own, so unless the phone copies the browser's cookie when the page is installed, the installed app has no way in. The app on your iPhone was in on 2026-11-22. How it got in wasn't looked at, and other phones are untried. A desktop app that wraps the page, which [the plan](../PLAN.md#direction) stays open to, could check the gateway's key by its fingerprint as a machine does. It would then need no certificate, on a plain LAN or anywhere else. That is untried.

*What is left of an agent apart from the gateway.*

The install at the start of the line `shrimpy invite <name>` prints, and an agent following its gateway's version, as the row on it has it, both decided on 2026-11-23.

**Left for later**

- **The chat server on a machine other than the gateway's.**

**Prove**

- An agent started under another OS user, in a container with no shared files, or on another machine joins with its invitation, shows up in the terminal, answers in a thread, and has its session watched and stopped from the gateway's machine.
- An agent with a missing or wrong token is refused, and so is one whose set of Pi packages differs from the gateway's, with what to run.

*The network: agents everywhere.*

Under Later in the [order of work](../PLAN.md#order-of-work).

**Outcome:** agents run in sandboxes and on Linux, the gateway reads who is at the other end from Tailscale where it is there, and your phone reaches Shrimpy through the web client.

**Build**

- Reading from Tailscale where it is there, and never needing it: which device of yours a machine is, and whether an agent connects from the machine it is expected from.
- A skill for adding a machine with Tailscale, and for pairing over SSH.

**Prove**

- An agent in a separate process from the gateway, with terminal and web attaching through it using the same contract as local use.
- Switching agents and sessions; allowed and denied access; agent, gateway and client disconnects and reconnects; fixed-target retry; completion against the agent's filesystem; moving an attachment.
- A gateway or chat server failure leaves accepted work with the agent; clients recover from committed state, and agents catch up on channel messages they missed.
- The same agent inside one real sandbox or VM, with the client outside and no shared files.
- A sandboxed agent whose only outbound access is the gateway and its model provider.
- A message typed in the console in a Telegram-bridged channel appears in Telegram, posted by the bot and labelled with your name.
- Through Telegram: a reset between admission and retry, duplicate and batched updates, offline periods, first start, late replies, long formatted output, quiet notices, photos, documents, voice notes and video, and a lost send acknowledgment.
