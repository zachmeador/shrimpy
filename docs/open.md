# 🦐 Open

The important open questions and issues, grouped by piece, with what waits on the owner first. A line leaves when it's done or dropped, and an important gap goes in with the change that finds it. What is decided and built is in the code and its commit messages. The smaller items this list used to hold are in git, in this file at `c041ebda`.

## Waiting on the owner

- Files copied into the owner's homes from the read-only archive kept read-only modes, in two homes, a `vault/.git` among them. Agents hit `EACCES` and worked around it with `chmod`. Making them writable is a one-time change to the owner's data, and should touch only what came from the archive, since some agents make their own files read-only on purpose.
- How the agent's tools are named and how they feel, which the owner wanted to try once the core was there. The questions are under Early thinking in this file at `c041ebda`. `attach`, which sends files with a reply, came after them and is one to try with them.

## Next

Daily use decides. The owner's last order was compaction and seeing the request a turn sent, under [the home](#the-home), then hearing a thread and its demo, under [the conversation model](#the-conversation-model). Later came the chat provider interface, agents everywhere, and what daily use asks for.

## The three programs

- `shrimpy up` stops everything when the gateway or the chat server ends, though it starts an agent that ends again on its own.
- A turn that a crash cut short says so only on an answer's receipt. One that ends with `END`, or is stopped, says nothing of the crash.
- Untried: running between two accounts of one machine, an agent on macOS joined to a gateway elsewhere, power loss, a full disk, log damage, a kill during a tool commit, and the lock an agent takes on its home on network file systems and sandbox mounts.

## The contracts

- The rest of the agent's operations, as members of `Agent` and `Session`, as daily use asks for them: withdraw, thinking level, defaults, context queries, completion against the agent's files, provider status and attachments.
- Untried for real: an agent following its gateway within a major, or after a release that changes the Pi packages, the terminal's `/update`, and the page reloading itself, or offering a reload, in a browser. Following within a major needs an agent on a release that has it, so the first chance is a candidate of the next 2.x minor and its release.
- For Pi's developers: will Chord raise its protocol version for every wire change, and from when? Until it does, a Pi release reaches every machine together.

## Identity and addressing

- From an agent's shell, `agent init`, `agent serve` and `up` skip the admin check, and `status` lists no admins.

## The conversation model

- Hearing a thread while working in it: a message that wakes nobody, in a thread where the agent's session is busy, is written into that session as an entry of Shrimpy's own kind that starts no turn, up to 20,000 characters a turn, and what every agent is told gains two sentences on it. A demo decides whether it stays: three agents in a room on a LAN model, asked the same thing with nothing, with one sentence telling them to read the thread first, and with hearing.
- Attachments fall short of the [web mockup](web-client-mockup.html) in two places: the agent's view doesn't show the files an agent's own reply carried, under its words, and pictures among what was said since an agent last looked are named to the model, not shown. The shell lists a message's files and fetches none. Untried: an upload carried on after a dropped link, the picker and a paste on a real phone, and a file to or from an agent apart.
- Setting pins, from the clients and by agents. Chat keeps a channel's pins and the clients show them, but how the clients set one isn't drawn.
- `shrimpy threads` with no argument refuses instead of listing an agent's or person's recent threads across channels.

## The home

- Compaction: Shrimpy's guidance for the summary itself, on dates, voice, paths and the state of work (pre-compaction recall via `history`, the post-compaction reminder, and the threshold test are in place).
- The rule for ending a turn with `END` sends small models into long deliberation over a one-word reply.
- The models an agent says it can use are those Pi lists as available, which checks more than the start does, so the home's own model can be missing from the list, and `setModel` can refuse a model the agent would start with.
- A Shrimpy folder on a share that drops for a moment empties every agent's copy of the workspace context until it is back, and costs each agent a restart, since `up` takes a home whose `agent.json` it can't see for gone.

## The network

- On Linux, stopping or restarting the service kills whatever an agent's shell left running, without telling it, unless it runs in a unit of its own, as `systemd-run --user` makes. Every update restarts the service.
- Over a network, an agent that restarts is turned away until Chord's heartbeat closes its old link, about half a minute later.
- A service gets the `PATH` of the shell that ran `shrimpy install`, and agents' shells look for every command but `shrimpy` on it. A command sent over SSH with no login shell has a shorter one. A service that `shrimpy update` installs from an agent's shell gains `~/.local/bin` once more with each update.
- The runtime directory is `$XDG_RUNTIME_DIR/shrimpy` where that is set and `/tmp/shrimpy-<uid>` where it isn't, so a gateway a service started and a command typed in a shell may look in different places.
- On macOS nothing runs after a restart until the account logs in, which an account with no secure token can't do by itself under FileVault. Running with nobody logged in takes root.
- Nothing slows wrong invitation codes across many connections, and connections still in their TLS handshake aren't counted with those waiting to say hello.
- Nothing renews a browser's cookie before its 400 days are up, and the page's certificate is renewed by hand.
- Untried: an agent in a real sandbox, container or VM with the client outside and no shared files, and one whose only outbound access is the gateway and its model provider.

## What an agent does unasked

- An agent that follows its gateway to a new release says so in no thread, and a turn that the restart pauses isn't told why.

## Using it

- Choosing the model an agent starts with, in either client. The agent serves `setModel` since 2.0, and nothing calls it yet.
- Showing captured model requests (`Session.requests` and `Session.request`) in the web and terminal Watch views.
- Reactions, edits and deletes: keys in the clients, and tools for agents, `react` and an `edit` option on `post`. How an agent deletes its own message isn't designed yet.
- Signing in and out from the terminal, as a `/` command, and seeing what a folder is signed in to. Today an entry leaves `providers/auth.json` by hand.
- Posting to a room from the shell, and deleting a room.
- Memory notes in an agent's own voice, with memory breadcrumbs and a search index behind them.
- In the terminal: multiline input, recovering a draft, and pasting clipboard text.
- Paging back through a long thread or session, in both clients. The terminal stops at the newest 200 messages.
- Tab completion for commands, agents and options in the shell.
- A Mac app that wraps the web client, in Electron.
- Untried: setting up through a bare `shrimpy` with a subscription's sign-in, under launchd, with a person at a real terminal, and `shrimpy update` on macOS from a real release.

## Tests

- A fixture of each store format shipped since 1.0.0, and a test that this release opens those of this major and the last.
