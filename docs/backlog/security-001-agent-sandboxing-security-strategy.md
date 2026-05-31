# 🦐 SECURITY-001: Agent Sandboxing and Local Security Strategy

Status: todo
Priority: P2
Area: Security

## Why
Users will reasonably want to run some agents without giving them broad access to sensitive parts of the machine. A home agent may need workspace access, model credentials, chat surfaces, browser control, filesystem tools, or coding capabilities, but not every agent should be able to read private documents, browser profiles, calendars, contacts, secrets, or other high-security local state.

Shrimpy needs a broad local security strategy for Linux and macOS before making strong runtime safety promises. The goal is to explore trustworthy per-agent boundaries that fit Shrimpy's CLI-first architecture, while staying honest about what can be enforced by platform sandboxing, process isolation, brokers, prompts, and operational defaults.

## Explore
- Define the user-facing policy model for per-agent local access: readable roots, writable roots, network mode, browser access, secrets access, device access, host-control capabilities, and brokered resources.
- Evaluate macOS enforcement options: App Sandbox, Seatbelt/SBPL profiles, XPC brokers, security-scoped bookmarks, LaunchAgents, dedicated browser profiles, separate users, lightweight VMs, and what can be enforced from a CLI-first install versus a signed helper app.
- Evaluate Linux enforcement options: bubblewrap, namespaces, seccomp, AppArmor/SELinux, systemd service sandboxing, containers, separate users, lightweight VMs, and remote/Pi execution for higher-risk agents.
- Compare coarse isolation strategies against fine-grained per-agent profiles. Include tradeoffs around setup friction, observability, portability, breakage, and how much security each option actually buys.
- Decide whether the gateway should run under one broad sandbox while individual agent turns run in short-lived stricter sandboxes.
- Design a capability inspection surface so users and agents can see the effective sandbox profile, not just the tool list.
- Identify sensitive local areas that should be denied by default: broad home-directory reads, browser profiles, keychain or keyring material, model auth files, contacts, calendars, photos, mail, messages, microphone, camera, desktop automation, system settings, SSH keys, cloud sync folders, and password-manager material.
- Define brokered-access patterns for secrets, user-selected folders, TCC/keyring-protected data, browser automation, network egress, and privileged host operations.
- Explore softer security enhancements alongside hard sandboxing: explicit escalation prompts, durable audit logs, per-agent trust levels, secret redaction, allowlisted commands, scoped environment variables, safer defaults for generated scripts, and clearer doctor/status warnings.
- Produce a phased implementation path that can start with documented policies, inspection, and diagnostics before native enforcement.

## Boundaries
- Do not implement native sandbox runners as part of this strategy item.
- Do not make sandboxing a second Shrimpy control plane; policies should remain inspectable workspace/runtime configuration.
- Do not grant broad home-directory access as the convenient default.
- Do not assume Docker-style containers are a complete host security answer.
- Do not block the simpler macOS setup/install work on this item.

## Notes
- Later-scope follow-up to [SETUP-001](setup-001-macos-friendly-install-docs.md).
- Builds on `docs/research/macos-seatbelt-helper.md`, especially the Shrimpy policy abstraction and tiny helper shape.
- Related product direction: `docs/musings/desktop-spotlight-surface.md`.
- Likely future files: sandbox policy reference docs, `src/config/*`, `src/tools/*`, session launch code, gateway lifecycle code, gateway service definitions, and platform-specific helpers or runners if the strategy chooses them.
- The useful product promise is not "agents cannot do anything bad"; it is "each agent has an explicit, inspectable local access profile with narrow defaults and clear escalation paths."
- Keep the first pass broad and thinky: capture good security enhancement ideas, then split implementation notes only after the strongest platform paths are clear.

## Done
- A written strategy compares practical Linux and macOS sandboxing/security options and recommends first enforcement paths.
- The strategy defines named per-agent policy profiles and their default reads, writes, network, browser, device, and secret-access behavior.
- Sensitive local resources have explicit default-deny or brokered-access decisions.
- Shrimpy has a proposed CLI/status surface for inspecting effective sandbox state.
- Follow-up implementation backlog items are split by phase instead of bundling research, native helper work, Linux runner work, docs, and runtime policy into one large item.
