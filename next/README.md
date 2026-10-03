# 🦐 Shrimpy, rebuilt

This is the new Shrimpy, built on Pi's durable runtime. It lives here until it replaces `src/`. The [replacement plan](../docs/REDESIGN/PLAN.md) owns the design, and its "Target source layout" section owns the rules below.

## Stay aligned with the plan

Build what the plan says. If the plan is wrong, unclear or silent, or the code can't follow it, stop and raise it with the user and the agent coordinating the build. Don't settle it quietly in the code: that is how slop piles up. Any visible choice you make that the plan doesn't cover goes in your report, so it can be reviewed.

## Check your work

```bash
npm install --ignore-scripts
```

```bash
npm run check
```

`check` runs the type check, lint and every test. Tests run straight from TypeScript with `node --test`, so there is no build step. Nothing here touches the root `dist/` that the installed `shrimpy` uses.

One test runs a turn with the shell tool against a real model, and is skipped unless you point it at a server. `SHRIMPY_TEST_MODEL_URL` is the server's OpenAI-compatible base URL, ending in `/v1`, and `SHRIMPY_TEST_MODEL_ID` is its model ID. The server needs no key.

```bash
SHRIMPY_TEST_MODEL_URL=http://localhost:8090/v1 SHRIMPY_TEST_MODEL_ID=my-model npm test
```

## Run an agent

`npm run shrimpy -- <command>` runs the command line from source. Each agent is a home folder, and `agent init` creates one. It never overwrites a file that exists.

```bash
npm run shrimpy -- agent init ~/agents/scout --name scout --model local/qwen3.8-27b
```

```text
agent.json            the agent's name and its default model
SOUL.md               its instructions
context/ vault/ skills/
state/pi/models.json  providers you declare, with their models
state/pi/auth.json    API keys, by provider
state/agent.sqlite    the engine's storage, made by the first start
runtime/              the owner lock, the endpoint and sockets
```

The default model is `provider/id`. Its provider is either one of Pi's built-in providers, with a key in `auth.json`, or one that `models.json` declares. A server of your own is declared like this, and the flags in it are the ones that server needs:

```json
{
  "providers": {
    "local": {
      "baseUrl": "http://localhost:8090/v1",
      "api": "openai-completions",
      "apiKey": "local",
      "compat": { "supportsDeveloperRole": false, "supportsStore": false, "supportsReasoningEffort": false },
      "models": [{ "id": "qwen3.8-27b", "reasoning": true, "contextWindow": 262144, "maxTokens": 65536 }]
    }
  }
}
```

A server that needs no key still takes a placeholder, so `apiKey` is set. A key in `auth.json` is `{ "anthropic": { "type": "api_key", "key": "..." } }`. Keys are used as written and are only read from these two files: the environment is not consulted, and `!command` or `$NAME` values are refused.

| Command | What it does |
|---|---|
| `agent init <home> --name <name> --model <provider/id>` | Creates the home. |
| `agent serve <home> [--now]` | Runs the agent in the foreground, which is what a supervisor or sandbox runs. It prints one JSON line when it is listening. |
| `agent status <home>` | Prints whether an agent is running there and how to reach it. Exits 1 if none is. |
| `sessions list <home>` | Lists the agent's sessions. |
| `sessions read <home> [--json]` | Shows the main session. |
| `sessions steer <home> <text> [--request-id <id>] [--wait]` | Gives the main session input. A retry with the same request ID is the same input. |
| `sessions stop <home>` | Cancels the main session's current work. The agent keeps running. |

`agent serve` stops on SIGTERM or Ctrl+C. It stops taking input, gives running turns up to five seconds to finish, then closes. Work that did not finish resumes at the next start. `--now`, or a second signal during the wait, skips the wait.

`sessions steer --wait` prints the answer, then exits 0 when the input was answered, 130 when it was cancelled, and 1 when it failed or ended without an answer. Any command exits 2 when it is used wrongly. The session commands talk to the running agent and never open the home's storage.

## The shape

`src/` is organized by program: `agent/`, `chat/`, `gateway/`, `clients/` and `cli/`. Programs never import each other. They share only `contracts/`, which carry Shrimpy's own shapes, and `lib/`.

- A file imports files in its own directory, or another directory's front door: its `index.ts` or its `node.ts`. A directory's files stay closed to the directories inside it, so what both need gets a directory of its own. Every front door opens with a short comment saying what the module is for and what it must not know.
- A module whose API partly needs Node offers that part through `node.ts`, and a file behind that door that needs Node is named `*.node.ts`. A module that is Node-only throughout has `node.ts` as its only door.
- Browser-safe code can't import Node or a `node.ts` door. That is the web client and everything in `contracts/` and `lib/` apart from the files that need Node, so a `lib/` module's `index.ts` door and everything behind it is browser-safe. `lib/testing` is test support and is exempt.
- Tests sit beside the code as `*.test.ts`. Test support lives in a `testing/` module that only tests import.
- Only `agent/` imports Pi's durable runtime, and `agent/sessions/` is the one place that reads Pi's records.

`lint/boundaries.js` enforces these rules, so a violation fails `npm run check`.

No shortcut reaches a commit: a module's front door, tests and lint coverage exist before its first commit.
