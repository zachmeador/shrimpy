# 🦐 Third-Party Notices

Shrimpy's repository holds only Shrimpy's own code and pictures. Its dependencies come from npm when Shrimpy is installed, each under its own license, and the install script downloads Node from nodejs.org.

Shrimpy depends directly on these, at the versions in `package.json`:

| Package | License |
|---|---|
| [Pi](https://github.com/earendil-works/pi)'s `@earendil-works/chord`, `pi-ai`, `pi-durable`, `pi-schema` and `pi-tui` | MIT |
| `cron-parser`, `esbuild`, `marked`, `preact` and `ws` | MIT |
| `@fontsource-variable/atkinson-hyperlegible-next` and `-mono`, the web client's typeface | OFL-1.1 |

The packages these bring in are under MIT, Apache-2.0, BSD-3-Clause, the Unlicense and 0BSD. The Apache-2.0 ones are mostly the AWS, Google and OpenAI SDKs that `pi-ai` uses to reach those providers. `package-lock.json` names every package, and each package names its license in its `package.json`.
