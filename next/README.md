# 🦐 Shrimpy, rebuilt

This is the new Shrimpy, built on Pi's durable runtime. It lives here until it replaces `src/`. The [replacement plan](../docs/REDESIGN/PLAN.md) owns the design, and its "Target source layout" section owns the rules below.

## Check your work

```bash
npm install --ignore-scripts
```

```bash
npm run check
```

`check` runs the type check, lint and every test. Tests run straight from TypeScript with `node --test`, so there is no build step. Nothing here touches the root `dist/` that the installed `shrimpy` uses.

## The shape

`src/` is organized by program: `agent/`, `chat/`, `gateway/`, `clients/` and `cli/`. Programs never import each other. They share only `contracts/`, which carry Shrimpy's own shapes, and `lib/`.

- Every directory has one front door, `index.ts`, and code outside the directory imports only that. The door opens with a short comment saying what the module is for and what it must not know.
- A module whose API partly needs Node offers that part through `node.ts`. Browser-safe code can't import it.
- Tests sit beside the code as `*.test.ts`. Test support lives in a `testing/` module that only tests import.
- Only `agent/` imports Pi's durable runtime, and `agent/sessions/` is the one place that reads Pi's records.

`lint/boundaries.js` enforces these rules, so a violation fails `npm run check`.

No shortcut reaches a commit: a module's front door, tests and lint coverage exist before its first commit.
