# 🦐 For the Author to Review

What is waiting on you, and nothing else. The coordinator adds an item when a question needs you, or when a build makes a choice that changes the design. An item leaves when you answer it, and its decision moves into the [design](README.md). A small choice a build makes is noted in the [log](history/LOG.md) entry of the change that made it.

## Waiting on you

1. **A first real sign-in.** `shrimpy providers login` is built, and has only been through a made-up sign-in and an API key, since a real one needs your account. Run it in a folder of its own, with `SHRIMPY_DIR` set, or in your own, and say what a subscription's flow did: the link, the code you paste back, and whether an agent made with plain `shrimpy agent init` then answers. [The log](history/LOG.md) has what was built and what is untried.
2. **An agent under a second OS user.** A gateway on a Mac and an agent on your Linux machine were paired on 2026-10-07 through a tunnel and on 2026-10-08 straight over the tailnet. The one case of your setup that hasn't run is an agent on the gateway's own machine under another OS account. It takes the same path, over a loopback address, and it needs an account that isn't mine to make. Not urgent: say when you want it tried, or try it.
3. **An agent hearing a thread while it works in it.** Your idea of 2026-10-06: what anyone says in a thread reaches an agent that is working there at its next step, and wakes nobody. Pi has the piece for it, a submission that adds to a session and never starts a turn. [The proposal](proposals/hearing-a-thread.md) has how it would work, ten details with what I'd do about each, what it costs, and the version with no mechanism, which is one sentence in the instructions.
4. **What a refusal is in Shrimpy's contracts.** Refusals carry their reason inside Pi's error code, and contracts still show Pi's own error types. Nothing is broken. Deciding it would make it intentional. Not urgent.
