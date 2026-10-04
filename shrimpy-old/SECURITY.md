# 🦐 Security

**tldr:** If you don't know what you're doing, you can get totally wrekt. Shrimpy, OpenClaw, Hermes Agent, and similar systems can run powerful tools against your files, accounts, and messages. Shrimpy's goal is not to *mislead you* about this.

Shrimpy gives agents real access to your machine. It does not sandbox or contain them. Only run it where a mistaken, manipulated, or compromised agent can do acceptable damage.

## Security assumptions

- The host, OS account, Shrimpy installation, workspace, configuration, and local operators are trusted.
- Model providers and any connected tool providers are trusted with the data sent to them.
- Agent output and every model input—including chat messages, files, web content, tool results, channel history, skills, and remembered context—may be malicious or misleading.
- The operator is responsible for limiting capabilities, reachable data, external ingress, and unattended execution.

## Current boundaries

- **No sandbox:** Shrimpy does not provide process, filesystem, or network isolation. Pi tools run with the permissions of the Shrimpy OS process. Disabling `bash` or another tool reduces capability; it does not create containment.
- **No isolation between agents:** agent folders, sessions, channel membership, and channel policy organize context and routing. They are not access-control boundaries. A tool-capable agent may read or modify other workspace or host data available to the process.
- **No prompt-injection defense:** instructions embedded in messages, documents, websites, tool output, skills, or memory can steer an agent. Models cannot reliably distinguish trusted instructions from hostile content.
- **Skill installation is not a security review:** Shrimpy checks package shape, paths, naming, and compatibility, but does not evaluate third-party skills for malicious instructions, unsafe scripts, prompt injection, or data exfiltration. An installed skillpack becomes trusted input to any agent that can load it.
- **Chat surfaces are remote agent ingress:** a wrong allowlist, shared bot, channel membership, default-agent route, or channel policy can give unintended people a path to an agent's tools. Agent channel policy defaults to accepting all eligible messages. Treat a misconfigured surface as a critical security exposure.
- **Agents can leak data:** an agent with access to secrets plus any outbound path—chat replies, channel tools, network tools, shell commands, or generated artifacts—may disclose them.
- **Automation increases impact:** watches and gateway turns can act without a person reviewing each step. Persistent sessions and memory can carry poisoned context into later work.
- **Local data persists:** workspace config, credentials, transcripts, channels, logs, downloaded media, and generated files may contain sensitive information. Workspace checkpoints intentionally exclude several sensitive paths, but they are not a backup or data-loss boundary.

## Operate defensively

- Run Shrimpy under a dedicated, least-privileged OS account, container, or VM when the host contains valuable data or credentials.
- Give each agent only the tools and files it needs. Treat `disabledTools` as risk reduction, not a sandbox.
- Use dedicated chat bots, exact sender/chat allowlists, minimal channel membership, and restrictive channel policies. Re-audit routing after configuration changes.
- Keep secrets out of reachable files and environment variables unless the agent truly needs them. Prefer scoped, revocable credentials.
- Treat external content and third-party skills as untrusted. Read `SKILL.md` and inspect bundled scripts, references, and assets before installation or update; provenance and successful validation do not imply safety.
- Inspect watches and agent capabilities before leaving the gateway unattended, and keep recoverable backups of data an agent can modify.

See [the security reference](docs/reference/security.md) for the current inspection commands and tool-policy controls.
