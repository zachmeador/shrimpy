# 🦐 Sandboxing Runtime Scout

Originally researched: 2026-08-26
Last refreshed: 2026-09-16 (networking follow-up; broad survey Sep 14)
Status: Research; no backend selected or locally validated

## Current recommendation

**Compare SRT with nono for whole-process containment, then Smol Machines with Microsandbox for a microVM boundary.** SRT remains the smallest first integration experiment for Shrimpy's TypeScript runtime. Smol belongs on the leading shortlist: its engine and SDK are separate projects, and inspecting only one misses part of the product.

If networking decides the VM choice, test Microsandbox first: its documented policy connects DNS answers, destination addresses, TLS names, and inspected HTTP requests. Smol's inspected hostname gate authorizes addresses learned from DNS. This ranking reflects policy design, not measured reliability. See the [networking comparison](#networking-comparison) and nono's [advisory qualifications](#nono-retain-as-a-serious-process-policy-comparison).

This is a source-based recommendation, not a security certification or benchmark. [SECURITY.md](../../SECURITY.md) still describes Shrimpy accurately: its agents are not OS-sandboxed. The [Pi durable plan](../REDESIGN/PLAN.md#sandboxing) sandboxes the **entire agent process**, including Node operations, Pi extensions, Bash, and descendants. That is a plan, not an implemented guarantee.

The refresh checked public release metadata, package metadata, READMEs, selected implementation files, and published advisories. Tagged sources are linked where practical; explicitly identified `main` observations may be ahead of releases. Release numbers across projects are not maturity scores. No packages were installed, VMs booted, agents launched, or containment tests run.

## Shortlist and release snapshot

SRT, nono, SmolVM, and Microsandbox releases were rechecked on Sep 16; the Smol SDK, Shuru, Torkbot, and wider survey retain their Sep 14 observations. A GitHub release, an npm package, and an engine bundled inside that package can have different versions.

| Candidate | Observed release | Boundary and integration | Research judgment |
|---|---|---|---|
| [Anthropic SRT](https://github.com/anthropics/sandbox-runtime/releases/tag/v0.0.76) | `0.0.76`, Sep 10 | Seatbelt/macOS; bubblewrap/Linux; TypeScript API and CLI | First OS-process experiment; private reads and cleanup remain gates |
| [nono](https://github.com/nolabs-ai/nono/releases/tag/v0.78.0) | `0.78.0`, Sep 16 | Seatbelt/macOS; Landlock and additional enforcement/Linux; CLI and libraries | Process-policy comparison; unresolved advisory evidence needs review |
| [SmolVM](https://github.com/smol-machines/smolvm/releases/tag/v1.16.1) / [Smol SDK and CLI](https://github.com/smol-machines/smol/releases/tag/v1.15.0) | Engine `1.16.1`, Sep 15; SDK/CLI `1.15.0`, Sep 11 | libkrun microVM; Node/Python SDK and CLI | Leading VM experiment; pin the actual bundled engine too |
| [Microsandbox](https://github.com/superradcompany/microsandbox/releases/tag/v0.7.0) | `0.7.0`, Sep 16 | libkrun microVM; native SDKs and CLI | First VM experiment if networking policy is decisive |
| [Shuru](https://github.com/superhq-ai/shuru/releases/tag/v0.7.0) | `0.7.0`, Aug 5 | Virtualization.framework/macOS; experimental KVM/Linux ARM64 | Useful overlay-workspace comparison; Bun-based SDK |
| [Torkbot Sandbox](https://github.com/torkbot/sandbox/releases/tag/v0.21.0) | `0.21.0`, Sep 2 | libkrun microVM; TypeScript host policy and virtual filesystems | Promising embedding design; packaging and failure behavior need review |

## SRT: smallest first experiment

SRT can wrap the full Node/Pi command, rather than only a Bash tool. The project remains a beta research preview. The [0.0.76 release](https://github.com/anthropics/sandbox-runtime/releases/tag/v0.0.76) adds root-caller capability dropping on Linux, control-pipe exit handling, and checks rejecting allowed hostnames that resolve to loopback, link-local, or configured private ranges. The repository has moved to `anthropics/sandbox-runtime`.

The [tagged configuration documentation](https://github.com/anthropics/sandbox-runtime/blob/v0.0.76/README.md) makes several limits explicit:

- Reads are broadly allowed by default. `denyRead` and `allowRead` build exceptions; declaring writable roots does not make other agents' files private.
- Private network ranges are not all blocked automatically. `deniedResolvedAddresses` supplies additional IPv4 and IPv6 ranges. For Shrimpy, include any LAN or overlay network that the agent must not reach.
- Linux cannot implement the macOS Unix-socket path allowlist through the same seccomp option. Missing socket filtering can produce a warning and weaker enforcement; Shrimpy must reject a launch when required isolation is missing.
- `allowAppleEvents` permits launching applications outside the sandbox. It cannot be enabled by agent- or project-writable policy.

The [0.0.76 manager](https://github.com/anthropics/sandbox-runtime/blob/v0.0.76/src/sandbox/sandbox-manager.ts) still stores configuration, proxy servers, and initialization state in module globals. Independent agents with independent policies therefore need separate manager processes. A small supervisor per agent is a plausible implementation; loading multiple policies into one singleton is not.

Use trusted programmatic configuration, an allowlisted environment, private HOME/scratch, and a narrow inherited control channel. Test the exact read policy on both [macOS](https://github.com/anthropics/sandbox-runtime/blob/v0.0.76/src/sandbox/macos-sandbox-utils.ts) and [Linux](https://github.com/anthropics/sandbox-runtime/blob/v0.0.76/src/sandbox/linux-sandbox-utils.ts): path rules, special files, root denies, and exceptions do not have identical implementations. Whether the intended descriptor survives launch is also an experiment, not an API promise.

SRT's published [network advisory](https://github.com/anthropics/sandbox-runtime/security/advisories/GHSA-9gqj-5w7c-vx47) lists versions before `0.0.16` as affected and `0.0.16` as patched. This is distinct from the newer hardening work and does not establish that all network cases are covered.

## nono: retain as a serious process-policy comparison

nono applies OS restrictions to the whole process. Its current policy and proxy machinery is broader than the older Pi-pack description; see the refreshed [Pi comparison](pi-sandboxing-implementations.md). The [0.76.0 changes](https://github.com/nolabs-ai/nono/releases/tag/v0.76.0) include multi-hop symlink resolution and removal of blanket `/Volumes` reads. [0.77.0](https://github.com/nolabs-ai/nono/releases/tag/v0.77.0) includes breaking profile cleanup and further credential and network work.

Its [security policy](https://github.com/nolabs-ai/nono/blob/main/SECURITY.md) still says guarantees are unstable and production use is not recommended. Concrete examples explain why the warning matters:

- The [same-port proxy bypass](https://github.com/nolabs-ai/nono/security/advisories/GHSA-6hww-cch7-pfrh) allowed a Linux child to connect to the proxy's port number on other hosts. Landlock's port grant did not enforce the intended destination address.
- The [DNS tunneling issue](https://github.com/nolabs-ai/nono/security/advisories/GHSA-gcpc-cqvp-h5c8) resolved a hostname before rejecting it. Data in the query name had already left the sandbox even though the HTTP request failed.
- Those issues, [hostname normalization](https://github.com/nolabs-ai/nono/security/advisories/GHSA-7q3j-vfmx-gc9g), and [legacy syscall-ABI bypass](https://github.com/nolabs-ai/nono/security/advisories/GHSA-vhq2-h2q7-8mmc) list `0.74.0` as patched. The proxy/DNS advisories credit an X41 audit sponsored by OSTIF. That is evidence of independent scrutiny, not an assurance that every current configuration is safe.
- The [endpoint-policy advisory](https://github.com/nolabs-ai/nono/security/advisories/GHSA-8r33-hr9m-69wh), published Sep 16, describes mismatched URL-path interpretation between the proxy's permission check and the upstream server. It lists one variant fixed in `0.73.0` and another with no patched version. This pass did not reproduce the variant or establish whether `0.78.0` closes it; treat that as unresolved evidence before relying on route restrictions for authorization.

[0.78.0](https://github.com/nolabs-ai/nono/releases/tag/v0.78.0) also links newly published advisories for [pack signature verification](https://github.com/nolabs-ai/nono/security/advisories/GHSA-6542-g6qc-gj95), [gitdir-derived grants](https://github.com/nolabs-ai/nono/security/advisories/GHSA-7cwr-ghvv-24jf), and [agent-writable git configuration](https://github.com/nolabs-ai/nono/security/advisories/GHSA-222m-44fg-jx8g), each listing `0.78.0` as patched. A separate [tool-shim advisory](https://github.com/nolabs-ai/nono/security/advisories/GHSA-wjv5-93q3-xm73) still says an unaffected version is not released. Release-note inclusion alone does not prove a fix. The warning concerns policy composition, broker behavior, and configuration trust as well as OS primitives.

## Smol Machines: engine and SDK both matter

The [SmolVM 1.16.0 engine](https://github.com/smol-machines/smolvm/blob/v1.16.0/README.md) provides a separate guest kernel, OCI images, persistent and disposable machines, explicit directory mounts, and opt-in networking. The release adds incremental live checkpoints and fixes around scoped memory, checkpoint ownership, and restart safety. Branching warm machines may help repeated agent work, but published boot/fork timings are upstream measurements, not Shrimpy results.

The [Smol 1.15.0 Node SDK](https://github.com/smol-machines/smol/blob/v1.15.0/sdk/node/README.md) embeds a native client while running the VMM in a separate helper, with Linux seccomp/Landlock confinement described by upstream. Local prebuilds target Apple Silicon and Linux x64/ARM64 with glibc 2.34 or later. Engine support is broader than SDK prebuild support; do not advertise an engine platform as a supported Shrimpy SDK platform. The SDK also has local/cloud transports, but some streaming and image operations remain local-only.

The engine's [security model](https://github.com/smol-machines/smolvm/blob/v1.16.0/README.md#security-model) is explicit about authority: mounts expose host paths, SSH-agent forwarding grants signing access, and enabled networking expands reachability. Its local control plane trusts the invoking host user. Directory mounts are not single-file grants. Releases have checksums, but the documented installer can continue when the checksum file is unavailable; release signatures and provenance attestations are not claimed. A Shrimpy installer should pin artifacts and require successful verification.

No public SmolVM advisories were returned by GitHub during the Sep 14 survey. That does not prove an absence of vulnerabilities. Host-side credential injection equivalent to Microsandbox or Torkbot was not established by the inspected Smol sources; do not count it as a supplied capability. The Sep 16 networking follow-up inspected engine `1.16.1`; it did not establish which newer engine the separately released SDK bundles.

## Microsandbox: useful policy, precise defaults

[0.6.18](https://github.com/superradcompany/microsandbox/releases/tag/v0.6.18) primarily fixes release publishing. [0.6.17](https://github.com/superradcompany/microsandbox/releases/tag/v0.6.17) adds outbound SOCKS proxy work. The SDK starts a VM child process and exposes mounts, execution, guest state, and lifecycle operations.

The Sep 16 follow-up checked [0.7.0](https://github.com/superradcompany/microsandbox/releases/tag/v0.7.0), which adds TCP/UDP connection-limit configuration and further network reliability work. The detailed comparison below uses its tagged networking documentation; the older source-based advisory observations below retain their stated versions.

The [network documentation at 0.6.18](https://github.com/superradcompany/microsandbox/blob/v0.6.18/docs/networking/overview.mdx) now clearly describes public internet access as the default, with private/host access denied. Explicitly disable the network device or select a deny policy for offline agents. Those are different mechanisms. A hostname allowlist also needs a decision about TLS interception: strict hostname mode refuses opaque HTTPS that would otherwise be allowed only by hostname. Do not equate a default public-egress policy with an airgap.

[Volumes](https://github.com/superradcompany/microsandbox/blob/v0.6.18/docs/sandboxes/volumes.mdx) and [secret substitution](https://github.com/superradcompany/microsandbox/blob/v0.6.18/docs/security/secrets.mdx) provide useful integration seams. Secrets can stay in the host-side proxy while the guest uses placeholders. This still grants the guest whatever actions the allowed endpoint and credential permit; it is not operation-level authorization.

Two advisory details require care:

- The [guest-copy symlink advisory](https://github.com/superradcompany/microsandbox/security/advisories/GHSA-4vq3-cjpp-v7fg), published Sep 9, lists `0.6.6` as affected and `0.6.7` as patched. File export belongs in the acceptance suite as well as mounted-file access.
- The [process-argument secret advisory](https://github.com/superradcompany/microsandbox/security/advisories/GHSA-m8f5-rh7h-vgg3) has no patched version in its metadata. However, the inspected [0.6.18 Unix spawn path](https://github.com/superradcompany/microsandbox/blob/v0.6.18/sdk/rust/lib/runtime/spawn.rs) moves secret-bearing launch configuration through `--config-fd`. That is source evidence of a remediation path, not a reproduced security result or proof covering every entry point/platform.

## Networking comparison

Networking has three separate policy questions: where an agent may connect, which operations it may perform there, and which credentials it may use. Allowing an API host does not restrict HTTP methods or resources. Keeping a key outside the sandbox does not prevent misuse through an authorized proxy.

This section records the Sep 16 source review of SRT `0.0.76`, nono `0.78.0`, SmolVM `1.16.1`, and Microsandbox `0.7.0`. No traffic tests were run.

| Runtime | Default network posture | Enforcement path | Important distinction |
|---|---|---|---|
| SRT | Denied unless destinations are allowed | OS restrictions force connections through host HTTP/SOCKS proxies | Proxy environment variables guide clients; OS policy blocks direct bypass |
| nono | Unrestricted unless network policy is configured | Restricted modes use a supervisor proxy or deny networking entirely | Linux port grants alone do not identify a destination host |
| SmolVM | Networking disabled | Enabled traffic uses libkrun socket interception or a host virtual-network stack | Inspected hostname policy learns allowed IPs from DNS |
| Microsandbox | Public internet allowed; private/host access blocked | Host-side user-space stack mediates guest traffic | Can relate DNS, destination IP, TLS name, and inspected HTTP authority |

### SRT: mandatory proxy route

The [SRT documentation](https://github.com/anthropics/sandbox-runtime/blob/v0.0.76/README.md) describes HTTP/HTTPS proxying and SOCKS5 for other TCP traffic. Linux uses a network namespace with a Unix-socket bridge to the proxy; macOS permits connections to the proxy's localhost ports through Seatbelt. An application that ignores proxy settings should fail to connect rather than gain direct network access. Proxy support and non-TCP protocols therefore need compatibility tests.

Normal HTTPS tunnels enforce destination policy without inspecting encrypted requests. Experimental TLS termination enables request filtering and credential injection, at the cost of certificate/trust handling and compatibility with pinned certificates or mutual TLS. Bypassed TLS domains lose request inspection and injection. Private LAN/overlay ranges need explicit `deniedResolvedAddresses`; an allowed hostname is not automatically forbidden from resolving internally. Chained proxies must enforce equivalent destination checks at the hop that makes the connection.

### nono: destination and API policy

[nono's networking documentation](https://github.com/nolabs-ai/nono/blob/v0.78.0/docs/cli/features/networking.mdx) distinguishes opaque HTTPS CONNECT tunnels, a credential-injecting reverse proxy, and upstream corporate proxies. Method/path rules can narrow API access; encrypted request inspection requires TLS termination. Proxy sessions authenticate clients. Private RFC1918 addresses are permitted for enterprise use, so Shrimpy must define its own private-service grants.

Linux proxy-only mode combines Landlock with seccomp supervision of actual connection destinations. Raw port exceptions remain broader: a permitted destination port may be used on any host. Restricted modes also limit socket types and `io_uring` to close alternate network paths. On macOS, system DNS resolution can remain available even when connections are denied, and listening grants have broader bind/inbound effects than a single-port description suggests. Blocking outbound TCP is not proof that DNS or host IPC cannot transmit data. The advisory section above distinguishes patched bugs from unresolved endpoint-policy evidence.

### SmolVM: addresses learned from DNS

The [1.16.1 gateway policy](https://github.com/smol-machines/smolvm/blob/v1.16.1/crates/smolvm-network/src/egress.rs) checks connections against explicit IP/subnet grants or temporary IPs learned from allowed DNS answers. It describes corresponding enforcement in the libkrun socket-interception backend. The inspected local gateway default blocks metadata/link-local and host-loopback destinations while leaving LAN access possible after networking is enabled. Fleet mode has a stricter private-address floor; trusted configuration can change these modes.

The code's connection decision takes an IP address. Our inference is that this gate alone cannot prove the HTTP hostname, URL path, or operation reached at a shared IP. Do not treat `--allow-host` as an API permission system or assume cloud/fleet policy applies to local machines. Verify the selected engine, network backend, DNS behavior, and SDK configuration together.

### Microsandbox: policy at the guest network boundary

The [0.7.0 network-defense documentation](https://github.com/superradcompany/microsandbox/blob/v0.7.0/docs/security/network.mdx) describes host-side packet processing without host kernel routing/NAT. Its default allows public egress while blocking private, host, metadata, and link-local destinations, including `100.64.0.0/10`, which matters for Tailscale access. Guest loopback stays in the guest; host access is a separate grant.

Hostname rules combine observed DNS answers with destination-IP checks and TLS server names when present. TLS inspection can additionally check HTTP `Host` or HTTP/2 `:authority`. The [networking guide](https://github.com/superradcompany/microsandbox/blob/v0.7.0/docs/networking/overview.mdx) describes strict hostname mode for cases where opaque HTTPS cannot establish the required request authority. Encrypted DNS and tunnels still require deliberate policy; seeing ordinary DNS does not prove all name resolution is controlled. Published guest ports are separate inbound grants and bind to host loopback by default.

[Credential substitution](https://github.com/superradcompany/microsandbox/blob/v0.7.0/docs/security/secrets.mdx) keeps real keys in host memory while guests use placeholders. The allowed service still receives the real credential and can perform whatever its permissions allow. [Host socket routes](https://github.com/superradcompany/microsandbox/blob/v0.7.0/docs/networking/host-sockets.mdx) expose services through vsock without a TCP port; that is still a capability grant requiring service-side authorization.

### Proposed Shrimpy grants and proof

Keep model-provider access, public browsing/downloads, private services, and inbound listeners separate. A model connection should not imply general internet access; an internal service grant should not expose the whole LAN or Tailscale network. Scope credentials at the service and constrain host connectors to specific operations.

The networking part of the acceptance suite must test both allowed work and denied paths: direct connections that ignore proxy variables, IPv4/IPv6, DNS queries for rejected names, rebinding, shared destination IPs, forged TLS/HTTP names, URL normalization, redirects, encrypted DNS/tunnels, unrelated localhost services, and missing or crashed proxies. Use fake credentials and check both logs and actual destinations. Unix sockets, passed descriptors, and vsock services belong in the same review. A failed `curl` proves only that request failed; it does not prove no data left through DNS or another channel.

## Other candidates and changes

These candidates received release/README review on Sep 14, not equivalent implementation depth to the leading options. They were not rechecked during the Sep 16 networking follow-up.

| Candidate | Refresh finding | Fit for Shrimpy |
|---|---|---|
| [Microsoft MXC](https://github.com/microsoft/mxc) | Latest listed release remains `0.8.0` prerelease, Aug 22. README still explicitly rejects treating its current generated profiles as security boundaries. | Borrow capability reporting and policy inspection; not a containment dependency yet |
| [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) | Stable `0.0.116`, Aug 28; separate Sep 5 VM prerelease and rolling `dev`. Current gateway supports multiple compute drivers and provider policy. | Architecture reference; brings a separate control plane |
| [Torkbot Sandbox](https://github.com/torkbot/sandbox) | `0.21.0`; host-controlled virtual filesystems, explicit persistent state, default-deny callbacks, HTTP credential injection, separate helper. macOS helper may need local signing. | Strong embedding fit; validate packaging and host callback failure cases |
| [Shuru](https://github.com/superhq-ai/shuru) | `0.7.0` unchanged since Aug 5; macOS 14+/Apple Silicon, experimental Linux ARM64. Host mounts use disposable overlays unless host writes are explicitly enabled. | Useful scratch-workspace model; narrower platform/runtime fit |
| [AXIS](https://github.com/ROCm/axis) | Latest listed release `0.3.5`, Apr 10; `main` continues evolving. Linux default uses MXC bubblewrap; cooperative and strict proxy modes differ. | Inspect the effective backend; do not generalize strict networking to every mode |
| [RunSeal](https://github.com/runseal-labs/runseal) | `0.1.11`, Aug 15. Technical preview, Windows reference backend; experimental Mac/Linux modes. Networking may be unmanaged unless explicitly restricted. | Useful conformance and inspection design |
| [BoxLite](https://github.com/boxlite-ai/boxlite/releases/tag/v0.10.1) | `0.10.1`, Sep 14. Node-capable OCI microVM runtime; see advisory qualification below. | VM alternative after network-policy verification |
| [Quicksand](https://github.com/microsoft/quicksand) | Python/QEMU stack; image and runtime packages release independently. Network isolation by default; snapshots and desktop images. | Useful for browser/desktop workloads, larger integration than a Node runner |
| [Apple Containerization](https://github.com/apple/containerization/tree/b44e17e1a4c135bc0168e615bf6a8e3798d070c0) | `main` at `b44e17e` now documents a Linux Cloud Hypervisor/KVM backend as well as macOS Virtualization.framework. Latest listed GitHub release is `0.33.3` prerelease, Jun 1. | Native Swift substrate; the Linux source observation is not a released-platform guarantee |
| [Kubernetes Agent Sandbox](https://github.com/kubernetes-sigs/agent-sandbox/releases/tag/v1.0.2) | `1.0.2`, Sep 11; reached `1.0.0` Aug 28. CRD/controller; actual isolation depends on selected runtime and policy. | Remote cluster execution, not the default local runtime |
| [Sandlock](https://github.com/multikernel/sandlock/releases/tag/v0.8.7) | `0.8.7`, Sep 4; Linux 6.12+ process sandbox using Landlock, seccomp and a supervisor. | New Linux-only comparison if process-policy candidates fail |

BoxLite's two critical [read-only remount](https://github.com/boxlite-ai/boxlite/security/advisories/GHSA-g6ww-w5j2-r7x3) and [host-write traversal](https://github.com/boxlite-ai/boxlite/security/advisories/GHSA-f396-4rp4-7v2j) advisories list `0.9.0` as patched. Its [hostname/IP mismatch advisory](https://github.com/boxlite-ai/boxlite/security/advisories/GHSA-c7v3-78jq-x45m) lists affected versions through `0.9.5` but no patched version. A later version number alone does not resolve that evidence gap; the earlier note was too broad about current releases being fixed.

The broader search also checked [Dome](https://github.com/mhjmaas/dome), whose documented shape largely overlaps Shuru and has no listed release, and two operational alternatives: [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) now documents the `sbx` CLI and per-sandbox microVM/Docker environments; [GitHub Agentic Workflows](https://github.github.com/gh-aw/blog/2026-09-05-cloud-hypervisor-consolidation/) is consolidating its optional hardware-isolation path on Cloud Hypervisor while retaining default Docker execution. These are workflow/runtime products, not drop-in Shrimpy libraries. Firecracker, gVisor, and Kata remain substrate choices; this pass did not audit their internals.

## Licenses and native distribution

Repository license metadata and inspected top-level license files identify SRT, nono, Smol/SmolVM, Microsandbox, Shuru, OpenShell, AXIS, RunSeal, BoxLite, Apple Containerization, Kubernetes Agent Sandbox, and Sandlock as Apache-2.0. MXC and Quicksand identify MIT. Torkbot's [published npm metadata](https://registry.npmjs.org/@torkbot%2Fsandbox/latest) declares `MIT OR Apache-2.0`; a corresponding root license file was not established in this pass, so verify the packaged notices before redistribution.

The top-level license is not the complete native bundle inventory. SmolVM's [tagged third-party inventory](https://github.com/smol-machines/smolvm/blob/v1.16.0/Licenses.md) lists libkrun as Apache-2.0, libkrunfw library code as LGPL-2.1-only, and the bundled Linux kernel as GPL-2.0-only. Review the actual engine, firmware, guest image, and helper artifacts to be shipped, including corresponding source and notices; do not assume every libkrun-based project bundles identical versions or components. This pass records licensing evidence, not a completed redistribution review.

## Shared acceptance suite

Run these checks in disposable fixtures on both intended host platforms before selecting a backend. Source review is insufficient.

1. **Whole-process enforcement:** direct Node reads/writes, Pi built-ins, arbitrary extension code, shell children, detached grandchildren, and inherited descriptors.
2. **Private files:** deny sibling agents, Shrimpy configuration/provider state, SSH material, browser profiles, and unrelated home paths. Exercise nested exceptions, symlinks, changed ancestors, new files, and special files.
3. **Network and IPC:** run the [networking proof cases](#proposed-shrimpy-grants-and-proof), including direct IP traffic, DNS leakage/rebinding, request identity, LAN/overlay/metadata addresses, inbound listeners, and host IPC. Test missing proxies and filters.
4. **Credentials and services:** inspect launch arguments/logs using fake secrets; test forbidden destinations and host-side tools that could act with greater authority than the child.
5. **Lifecycle:** cancel during work, kill child and supervisor separately, attempt detached descendants, restart after a crash, and prove the old process tree is gone before launching a replacement. A released lock is insufficient evidence.
6. **VM and git output:** read-only remounts, malicious exported symlinks, patch traversal, modes/binaries/deletions, shared git metadata, and snapshot or branch state containing old credentials.
7. **Failure and cost:** missing dependencies, unsupported policy, corrupt state, disk exhaustion, CPU/memory/process limits, idle resident cost, cold/warm readiness, download size, and full cleanup. Reject unenforceable required grants; never silently run on the host.

First prove a useful resident Pi agent with explicit files and model connectivity. Then compare the same fixture under SRT/nono and Smol/Microsandbox. Keep backend selection in trusted configuration. Keep the exact measured capability record separate from upstream claims and from session tool policy.
