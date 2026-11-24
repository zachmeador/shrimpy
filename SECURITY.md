# 🦐 Security

**tldr:** If you don't know what you're doing, you can get totally wrekt. Shrimpy's agents run real tools against your files, accounts and messages, and Shrimpy's goal is not to *mislead you* about this.

Run Shrimpy only where a mistaken, manipulated or compromised agent can do damage you can accept.

## What Shrimpy trusts

- The machines and OS accounts it runs under, and their Shrimpy folders.
- The model providers you sign in to, with everything sent to them.
- Your devices: every machine whose Shrimpy folder joined as yours, and every browser you let in. Each one is you.

Everything an agent reads may be hostile: messages from people and other agents, files, web pages, tool output, skills and the workspace context.

## Where it stops

- **No sandbox:** an agent runs shell commands with every permission of the OS account that started it. To wall one off, run it under an account of its own, in a container or VM, or on another machine.
- **No isolation between agents under one account:** an agent under your account can do anything you can, such as read the other homes, their tokens, the roster and your sign-ins. Roles stop accidents there, not attacks. An agent under an account of its own reaches the gateway only with its own token, and can only ever be itself.
- **Admins can do a lot:** an admin can invite and remove agents, make rooms and add members, and watch or stop other agents' work. The first agent on a roster is an admin. `shrimpy members demote <name>` makes one an ordinary agent.
- **Sign-ins are shared:** every agent started in a Shrimpy folder can use the sign-ins and keys in its `providers/`, and any agent under the same account can read them.
- **No prompt-injection defense:** instructions inside a message, a file, a web page or a tool's output can steer an agent. Models can't reliably tell your instructions from anyone else's.
- **Agents can leak what they read:** an agent that can read a secret and has any way out, such as a message, a shell command or a web request, can send it on.
- **Triggers run unattended:** a trigger wakes its agent, or runs its shell check, on a schedule, with nobody watching each step.
- **Data stays on disk:** sessions, messages, the roster and sign-ins are files in the Shrimpy folder and each agent's home. Shrimpy doesn't encrypt them, and keeps the ones that hold secrets readable by their OS account alone.

## The network

Every program connects out to the gateway, so an agent needs no open port. On the gateway's machine, programs reach it on a socket only the gateway's OS account can open, and a connection there that shows no token is you.

With `--listen`, the gateway also takes connections on the addresses you name. Choose ones only your machines reach, such as a tailnet address. Connections there are encrypted and checked against the gateway's own key, whose fingerprint comes with each invitation. Each must show an agent's or a device's token, or an invitation's code, which works once and for fifteen minutes. The gateway keeps a hash of each token, and taking a token back ends its access at once.

The web client is served on loopback over plain HTTP. On any other address, which the folder's `settings.json` sets, it is served only over HTTPS. A browser gets in only through an invitation's link. Push notifications are encrypted for each device, so a push service sees when the gateway notifies a device but not what it says.

## Running it carefully

- Give Shrimpy an OS account of its own, a container or a VM when the machine holds data or credentials you'd be sad to lose.
- Put an agent that reads untrusted input, or shouldn't reach your other agents, under an account of its own.
- Keep secrets an agent doesn't need out of the files and environment it can reach. Prefer keys you can scope and revoke.
- Read a skill and its scripts before you give it to an agent.
- Take back a lost device in the terminal with `/devices take back <device>`.
- Look at an agent's triggers with `shrimpy triggers --agent <agent>` before you leave it alone, and keep backups of anything an agent can change.
