# 🦐 An agent on another machine, proposed

**State:** written on 2026-10-06, when you asked when the real piece starts: agents on other machines, and how pairing works. Nothing here is built. It leaves this folder when you have decided.

## Where it stands

The network is the reason for the rebuild, and it is the piece with the least built. What is there was built to be ready for it:

- Every connection to a program goes through the gateway by the program's name, on one machine too, with a ticket that says who is asking. That is the path a second machine will use.
- An agent's home makes a token, and the gateway knows the agent by it. An agent has one live body.
- Every link takes a transport, so the code that talks over a Unix socket today talks over a network connection unchanged. A transport over WebSocket exists, since the browser uses one.
- The gateway has a WebSocket entry for a browser on this machine. It pipes a connection to the gateway, or to a program by its name.

What isn't there:

- **The gateway listens only on this machine.** Its contract says that only a program on the gateway's machine can join, sign in, register or ask for a ticket.
- **Nothing lets a new machine in.** On this machine the socket's permissions are the check. From elsewhere there is no check yet, so there is no way in.
- **The gateway can't reach an agent elsewhere.** A program registers with the path of its Unix socket, and the gateway dials that path when someone asks for the program.
- **A home doesn't know where its gateway is.** It looks for a socket in this machine's runtime directory.

It stayed last in the order because it was parked behind "a second machine to test on". That was the wrong thing to wait for. Nearly all of it can be built and tested on one machine, with two folders that share no sockets and talk over a real network connection, and then proved on a second machine.

## Pairing, as you would do it

On the machine that runs the gateway, once:

```bash
shrimpy up --listen 100.101.102.103:7447
```

That opens the gateway to the address you name, which should be one only your own machines can reach, such as its Tailscale address. The folder remembers it.

To let an agent in from another machine, make an invitation:

```bash
shrimpy members invite
```

It prints one line to run on the other machine, with an address and a code that works once, for fifteen minutes:

```text
shrimpy agent join <name> shrimpy://100.101.102.103:7447/K7Q2-9FXD
```

On the other machine, which has Shrimpy at the same version:

```bash
shrimpy agent init crab --model local/qwen3.8-27b
shrimpy agent join crab shrimpy://100.101.102.103:7447/K7Q2-9FXD
shrimpy agent serve crab
```

`join` makes the home's token, shows the gateway the code and the token, and writes the gateway's address into the home. From then on `agent serve` connects out to that address by itself, and comes back by itself after either side restarts. On your machine crab is in the terminal's list like any agent: you talk to it in a thread, and watch and stop its sessions.

Nothing is opened on the other machine. The agent only connects out.

## Underneath

1. **The entry.** The WebSocket entry the browser uses also listens on the address you chose. A connection that shows an agent's token may do what a local program does: sign in, ask for tickets, register. A connection that shows nothing stays as limited as a browser page is today.
2. **Joining.** `join` takes the code with the name and the token. The gateway keeps a hash of the token and forgets the code, as it keeps no token today. A code can be for one name, so that whoever holds it can't take another.
3. **Reaching an agent that only connects out.** An agent elsewhere registers with no socket. When someone asks for it, the gateway tells the agent, over the connection the agent keeps open, and the agent opens one more connection to the gateway, which joins the two. The design already says this, in one sentence. The agent asks "who wants me" and waits, as it asks chat for events, so the gateway never has to reach it.
4. **A dead connection.** The gateway pings each connection from another machine and lets one go that stays silent for half a minute, so an agent that lost its network can register again. Today a registration lasts as long as its socket, which a dead network connection can outlive.
5. **Chat.** The chat server stays on the gateway's machine. An agent elsewhere reaches it by name through the gateway, as an agent here does.

## Built in three steps

1. **In from elsewhere.** The entry on an address, the invitation, `agent join`, and a home that remembers its gateway. An agent in a folder that shares no sockets with the gateway joins, reads chat and answers in a thread.
2. **Reached from here.** Registering with no socket, and the gateway joining a client to an agent that connects out. The terminal watches and stops that agent's sessions as it does a local one's.
3. **Kept honest.** Pings, coming back after either side restarts, a wrong or missing token refused, a version that differs reported. Then the same on a real second machine, and on Linux.

Each is tested on this machine over a real connection first.

## Left for later

- **You, from another machine.** The terminal on a laptop, with the gateway elsewhere. The design has a person from another machine recognized by their Tailscale login. Until then you use the terminal on the gateway's machine, or over SSH.
- **Sandboxes,** which need nothing more from Shrimpy than an agent that only connects out.
- **Encryption of its own.** On a tailnet the link is encrypted already. On a plain LAN the token and the messages would travel in the clear, and the docs would say so.
- **The chat server on a machine other than the gateway's.**

## For you to decide

1. **Pairing by an invitation** made on the gateway's machine and pasted on the other, as above. The other way round is the new machine asking and you approving it from here, which needs the gateway open to strangers first.
2. **Tailscale for the wire.** No encryption of Shrimpy's own for now, and a plain statement that the address you listen on should be one only your machines reach.
3. **Two new commands,** `members invite` and `agent join`, and one option, `--listen`. You are who asks for them.
4. **The order.** This next, ahead of the provider interface and the rest of the home.

## What I need from you

A second machine to prove it on at the end: its name, a way in over SSH, and your word that I may put a clone of this repo and a folder of its own there. Tailscale is installed on this Mac, and there is no container runtime here. `cashmoney` already serves your model, if that is the one.
