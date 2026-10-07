# 🦐 An agent on another machine, proposed

**State:** written on 2026-10-06, when you asked when the real piece starts: agents on other machines, and how pairing works. Reworked the same day, after you described the setup you expect to run and said that Tailscale is never to be needed. Nothing here is built. It leaves this folder when you have decided.

## Where it stands

The network is the reason for the rebuild, and it is the piece with the least built. What is there was built to be ready for it:

- Every connection to a program goes through the gateway by the program's name, on one machine too, with a ticket that says who is asking. That is the path a second machine will use.
- An agent's home makes a token, and the gateway knows the agent by it. An agent has one live body.
- Every link takes a transport, so the code that talks over a Unix socket today talks over a network connection unchanged. A transport over WebSocket exists, since the browser uses one.
- The gateway has a WebSocket entry for a browser on its own machine. It pipes a connection to the gateway, or to a program by its name.

What isn't there:

- **The gateway listens only on the machine it runs on.** Its contract says that only a program on that machine can join, sign in, register or ask for a ticket.
- **Nothing lets another machine in.** On the gateway's machine the socket's permissions are the check. From any other machine there is no check yet, so there is no way in.
- **The gateway can't reach an agent on another machine.** A program registers with the path of its Unix socket, and the gateway dials that path when someone asks for the program.
- **A home doesn't know where its gateway is.** It looks for the gateway's socket in the runtime directory of the machine it is on.

It stayed last in the order because it was parked behind "a second machine to test on". That was the wrong thing to wait for. Nearly all of it can be built and tested on one machine, with two folders that share no sockets and talk over a real network connection, and then proved on a second machine.

## The setup it has to fit

You expect a gateway on a server, most agents beside it, a few on that server under OS users of their own, and a few on other machines. Part by part:

| In that setup | With this proposal |
|---|---|
| The gateway, the chat server and most agents on one server | Built. `shrimpy up` starts them, each a process of its own, all as one OS user. None of it has been run on Linux. |
| Agents on that server under OS users of their own | The same as an agent on another machine. The gateway has to listen on a loopback address too. |
| Agents on other machines | What this proposal builds. |
| You, at a machine that isn't the gateway's | Over SSH to the gateway's machine, until the fourth step below. |

**An agent under another OS user is an agent on another machine.** The gateway's socket is in a directory that only the gateway's user can open. It has to stay that way, because a connection on that socket that doesn't sign in is taken for you. So an agent that runs as another user can't use the socket. It comes in as an agent on another machine does: over the entry, with its token, at a loopback address.

So the line is that socket, and not the machine. An agent runs beside the gateway, as its OS user, or apart from it: as another user, in a container or on another machine. The rest of this proposal is about an agent apart from it.

An agent apart from the gateway is also the first that the roster's roles hold for. One beside the gateway shares its OS user, so its shell can open the gateway's socket without signing in and be taken for you. The design accepts that: under one OS user the roster stops accidents and not attacks.

## Pairing, as you would do it

On the gateway's machine, once:

```bash
shrimpy up --listen 100.101.102.103:7447
```

That opens the gateway on the address you name, which should be one that only your own machines reach, such as its tailnet address. The folder remembers it. `--listen` can be given more than once, and a loopback address is what lets in an agent under another user of the gateway's machine.

To let an agent in, make an invitation for it:

```bash
shrimpy members invite crab
```

A name that is taken is refused there and then. Otherwise it prints one line to run where the agent will live, with the agent's name, an address and a code. The code works once, for fifteen minutes, and for that name only:

```text
shrimpy agent join shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD
```

Where the agent will live, with Shrimpy at the same version, you sign the folder in if it isn't yet, paste that line and start the agent:

```bash
shrimpy providers login
shrimpy agent join shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD
shrimpy up
```

`join` is about who is let in, and takes nothing else. It makes the home `crab` if the folder has none, with a name and no model. It makes the home's token, shows the gateway the code and the token, and writes the gateway's address into the home. It says at once whether the gateway let the agent in, and whether the two versions differ. `up`, in a folder whose agents all belong to a gateway elsewhere, starts those agents and no gateway. From then on the agent connects out to that address by itself, and comes back by itself after either side restarts.

The agent takes its model from the folder it is started in, as any agent does: `shrimpy providers login` signs a folder in once, for every agent started there, as [providers](../design/5-home.md) has it. None of that is in the line you paste: a model is no business of the gateway's.

On the gateway's machine crab is in the terminal's list like any agent: you talk to it in a thread, and watch and stop its sessions.

Nothing is opened where the agent lives. It only connects out.

### How short it gets

By hand it is one line on the gateway's machine and two where the agent will live, after a sign-in that a folder needs once. What is left can't be folded away: something has to say who is let in, and an agent needs a model.

An admin agent can do the rest for you. It makes the invitation, reaches the other machine over SSH, runs the join, and sets up whatever keeps the agent running there. The sign-in is yours, since it needs you at a browser. That takes a skill and a way to the machine, and no mechanism: the design already has an admin agent reaching its neighbors over SSH. `members invite` would be open to an admin agent, as `members promote` is.

## Underneath

1. **The entry.** The gateway listens on each address you chose, with the WebSocket entry it already has for a browser. A connection there that shows an agent's token is that agent, and may do what the agent may on the gateway's machine. One that shows a code, with the name the code is for, may join. One that shows neither gets nothing, not even the list a page in a browser on the gateway's machine gets today, and it is never taken for you, which only the gateway's own socket does. A way through to a program, such as chat, opens only with a ticket for that program, so nobody who hasn't signed in reaches one. A connection that says it comes from a web page is refused.
2. **Joining.** `join` shows the gateway the name, the code and the token. The gateway keeps a hash of the token and forgets the code, as it keeps no token today. A code is for one name, so that whoever holds it can't take another, and it is kept in memory as a ticket is, so a gateway that restarts forgets it. Being a member takes a name and a token, and no model: a home made by `join` names none, and takes the one its folder gives.
3. **Reaching an agent that only connects out.** An agent apart from the gateway registers with no socket. When someone asks for it, the gateway tells the agent, over the connection the agent keeps open, and the agent opens one more connection to the gateway, which joins the two. The design already says this, in one sentence. The agent asks "who wants me" and waits, as it asks chat for events, so the gateway never has to reach it.
4. **A dead connection.** The gateway pings each connection that comes over the entry and lets one go that stays silent for half a minute, so an agent that lost its network can register again. Today a registration lasts as long as its socket, which a dead network connection can outlive.
5. **Chat.** The chat server stays on the gateway's machine. An agent apart from the gateway reaches it by name through the gateway, as an agent beside the gateway does.

## Where Tailscale fits

You said on 2026-10-06 that Tailscale is never to be needed, and that it should fit like a glove. So everything in this proposal works on any network your machines share, with an invitation as the way in, and each thing Tailscale adds is one you could do without.

- **Uses.** A private, encrypted network between your machines, with addresses and names that stay put, and a policy that says which machine may reach which port. None of that needs a line of Shrimpy's code: the gateway listens on an address and an agent connects to one.
- **May read, later.** A program can ask the Tailscale daemon on its own machine who is at the other end of a connection: which device, and which user or tags own it. The design has a person on another machine recognized that way, and the gateway checking that an agent's token comes from the machine it is expected from. Tailscale's policy can also carry permissions for an application, which Shrimpy could read as who is an admin. Under your rule each of these saves a step and replaces nothing: the invitation and the token work without it. See the fifth decision.
- **Never manages.** Making auth keys, tagging devices, editing the policy and bringing a machine onto the tailnet are Tailscale's own business, done in its console or with its command. Doing them from Shrimpy would mean holding a key to your Tailscale account, redoing what its tools already do, and tying Shrimpy to one network.
- **Never served through it.** Shrimpy serves its own entry. It doesn't count on Tailscale Serve, or on any proxy, being in front of the gateway.
- **Between them, a skill.** An agent with a shell can run `tailscale status` and `tailscale ip`, and walk you through adding a machine. With Tailscale SSH, an admin agent reaches the machines it looks after with no keys to hand out. That is instructions, not a mechanism.

## Built in four steps

1. **Letting an agent in.** The entry on an address, the invitation, and a home that remembers its gateway. An agent in a folder that shares no sockets with the gateway joins, is listed as running, reads chat and answers in a thread. Being built since 2026-10-06, underneath first, as below. The commands follow as changes of their own: `--listen`, `members invite` and `agent join`, then `up` where there is no gateway.
2. **Reached through the gateway.** The gateway joining a client to an agent that connects out. Until then the gateway says that an agent apart from it can't be reached yet, where a client asks for its sessions. The terminal watches and stops that agent's sessions as it does those of an agent beside the gateway.
3. **Kept honest.** Pings, coming back after either side restarts, a wrong or missing token refused, a version that differs reported. Then the same with an agent under a second OS user, and on a real second machine.
4. **You, from another machine,** if you agree to the fifth decision: the terminal on a machine that isn't the gateway's, let in by an invitation of its own.

Each is tested on one machine over a real connection first.

**Linux comes first if the gateway's machine runs it.** All three programs would run there, and none has been run on Linux: the design left that for the pieces that cross machines. Running the checks there needs no new code, so it can happen before the first step. One thing to look at: the runtime directory is `$XDG_RUNTIME_DIR/shrimpy` where that variable is set and `/tmp/shrimpy-<uid>` where it isn't, so a gateway started by a service and a command typed in a login shell may not look in the same place.

## The first step, underneath

What is built first has no command. It is reached from code, and each command comes after as a change of its own.

- **Where the gateway listens.** It is started with the addresses to listen on, each a host and a port, and says which it got. On each it serves the entry: `/ws/gateway` for the gateway itself, and `/ws/<kind>/<name>` for a way through to a registered program. No files are served there.
- **Who a connection is.** A connection over the entry is apart from the gateway. Until it signs in or joins it may do only those two things. Once it has, it is that agent, and may list what is running and who is on the roster, ask for tickets, register, and promote or demote if it is an admin. It is never the person who runs the gateway.
- **An invitation.** A person or an admin asks the gateway for one, for a name that nobody has. It is a code of eight characters from an alphabet with no look-alikes, written `K7Q2-9FXD`, good once and for fifteen minutes, and kept in memory. The answer has the code and the addresses the gateway listens on, and with none it is refused: nobody could use it.
- **The link.** `shrimpy://crab@100.101.102.103:7447/K7Q2-9FXD` is the name, the address and the code. One function writes it and one reads it, for the command that prints it and the one that takes it.
- **Joining.** The home makes its token and keeps it first, as it does today. It then shows the entry the name, the token and the code. The gateway makes the member if the code is good for that name, and a home that never heard the answer asks again with the same token and is the same member. The home then keeps the gateway's address beside its token, and from then on reaches the gateway and chat there.
- **Being there.** An agent apart signs in and registers with no socket, so the roster says it is running and a copy of its home is turned away. A client that asks for a ticket to it is told that an agent apart from the gateway can't be reached yet.
- **A way through.** A program is reached over the entry with a ticket in hand, which the gateway looks at before it opens the way and the program then spends. So the way to a program takes the ticket as well as the name.

## Left for later

- **Commands about one agent, from elsewhere.** `sessions`, `triggers`, `agent reload` and the like find an agent by its home's folder and talk to it by that path, so they act on an agent only where its home is, and as its OS user. The terminal reaches an agent by its name through the gateway, so after the second step it lists, watches and stops an agent wherever it lives. Naming an agent by its roster name in a command is a change of its own.
- **A service.** Nothing installs what keeps `shrimpy up` running after its machine restarts. That is a systemd unit or a launchd job that you write, or an agent writes.
- **Sandboxes,** which need nothing more from Shrimpy than an agent that only connects out.
- **Encryption of its own.** On a tailnet the link is encrypted already. On a plain LAN the token and the messages would travel in the clear, and the docs would say so.
- **The chat server on a machine other than the gateway's.**

## For you to decide

1. **Pairing by an invitation** made on the gateway's machine and pasted where the agent will live, as above. Decided on 2026-10-06: you agreed, with `shrimpy members invite` printing the line to paste.
2. **Tailscale for the wire, and never needed.** Never needed is your rule of 2026-10-06. Still yours to say: no encryption of Shrimpy's own for now, so that on a network that isn't a tailnet a token and the messages travel in the clear, with a plain statement that the address you listen on should be one only your machines reach.
3. **The rest of the commands.** `agent join`, which the pasted line is, and one option, `--listen`. And one change to `shrimpy up`, which you asked about on 2026-10-06 and haven't decided: in a folder whose agents all belong to a gateway elsewhere, it starts those agents and no gateway. Today it would start a second gateway and chat server there, which nothing would use. You are who asks for them.
4. **The order.** You said on 2026-10-06 to get back to this after providers, and the first step is being built.
5. **You come in by an invitation too.** A machine of yours gets an invitation as an agent does, keeps a token in its Shrimpy folder, and is you from then on, and your Tailscale login can stand in for the token later. The rows of [identity](../design/3-identity.md) that had Tailscale as the only way in for you were changed on 2026-10-06, when you said you hadn't known the plan made it needed. The invitation for your own machine is proposed, and waits on you.
6. **A home can be made with no model.** Decided on 2026-10-06, with [providers](../design/5-home.md): an agent takes its model from the folder it is started in unless its `agent.json` names one. So `agent join` takes the invitation and nothing else, and the line the gateway's machine prints is the line you paste.

## What the proof needs

Two machines that reach each other over a network only your machines are on, with Shrimpy at the same version on both, at least one of them running Linux, and a second OS user on the gateway's machine. Either machine can be the gateway's. Which machines they are is yours to say, and is no part of the design: nothing here assumes where the gateway runs, where an agent runs, or where the work on Shrimpy is done.
