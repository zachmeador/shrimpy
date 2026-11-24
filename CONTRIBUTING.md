# 🦐 Contributing to Shrimpy

Welcome, hypothetical contributor.

Shrimpy runs on the Node that `.node-version` names, and the checks run there.

```bash
npm install --ignore-scripts
npm run check
```

`npm run check` runs the type check, the lint and all the tests. One test talks to a real model. It's skipped unless `SHRIMPY_TEST_MODEL_URL` is set to an OpenAI-compatible base URL ending in `/v1`, and `SHRIMPY_TEST_MODEL_ID` to a model it serves.

`npm run shrimpy -- <command>` runs the CLI from your checkout. Give everything you run its own `SHRIMPY_DIR` and `SHRIMPY_RUNTIME_DIR`, so it stays away from your real setup.

Read [how Shrimpy is built](docs/how-it-is-built.md) before the code. [`AGENTS.md`](AGENTS.md) has the rules for working here, and [the open list](docs/open.md) has what isn't built yet.

## Pull requests

Shrimp-sized: one change per PR. There are no templates. Just don't make the reader excavate. If you can't explain it, don't submit it.

Be decent. Shrimp are social animals.
